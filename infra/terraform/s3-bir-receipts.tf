# Phase 14 Dispatch 14 — Item 8: S3 BIR receipts bucket.
#
# BIR (Bureau of Internal Revenue) requires Official Receipt PDFs to be
# retained for 10 years. The bucket is dedicated (separate from customer
# uploads) so BIR audits don't have to scan unrelated objects. Object
# Lock COMPLIANCE mode prevents tampering during the 10y window.
#
# DEPLOY: this is the spec. Apply via `terraform apply` AFTER the BIR
# ATP from Item 2 is in hand and the production AWS account is ready.

variable "environment" {
  description = "Environment name (prod, staging)"
  type        = string
  default     = "prod"
}

resource "aws_kms_key" "bir" {
  description             = "BIR receipts bucket encryption key (10-year retention)"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  tags = {
    Environment = var.environment
    Compliance  = "BIR-10y"
    Dispatch    = "phase-14-d14"
  }
}

resource "aws_kms_alias" "bir" {
  name          = "alias/onservice-bir-receipts-${var.environment}"
  target_key_id = aws_kms_key.bir.key_id
}

resource "aws_s3_bucket" "bir_receipts" {
  bucket              = "onservice-bir-receipts-${var.environment}"
  object_lock_enabled = true

  tags = {
    Environment = var.environment
    Compliance  = "BIR-10y"
    Dispatch    = "phase-14-d14"
  }
}

resource "aws_s3_bucket_versioning" "bir" {
  bucket = aws_s3_bucket.bir_receipts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "bir" {
  bucket = aws_s3_bucket.bir_receipts.id

  rule {
    default_retention {
      mode  = "COMPLIANCE"
      years = 10
    }
  }

  depends_on = [aws_s3_bucket_versioning.bir]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "bir" {
  bucket = aws_s3_bucket.bir_receipts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.bir.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "bir" {
  bucket = aws_s3_bucket.bir_receipts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Deny non-TLS access (mirror Bug 1325 fix from D01).
resource "aws_s3_bucket_policy" "bir_deny_insecure" {
  bucket = aws_s3_bucket.bir_receipts.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.bir_receipts.arn,
          "${aws_s3_bucket.bir_receipts.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

output "bir_bucket_name" {
  value = aws_s3_bucket.bir_receipts.id
}

output "bir_bucket_arn" {
  value = aws_s3_bucket.bir_receipts.arn
}

output "bir_kms_key_arn" {
  value = aws_kms_key.bir.arn
}
