# MED-O03 fix — shared S3 server access log bucket.
#
# Both s3-bir-receipts.tf and s3-customer-uploads.tf had no
# `aws_s3_bucket_logging` resource, so any read or write to the
# 10-year BIR archive (or to the customer-uploads bucket) left no
# server-side trail in S3 itself. CloudTrail captures management
# events but data events on those objects must be opted in
# explicitly. A leaked access key could read the entire BIR archive
# and we'd find out only via the consequence — never via a log.
#
# This file creates one shared log-archive bucket and lets the
# other two .tf files attach `aws_s3_bucket_logging` to it. The
# log bucket itself is:
#   - SSE-S3 (AES256) — KMS would create a circular dependency
#     with the BIR bucket's key, and AES256 is sufficient for
#     access-log retention.
#   - Lifecycle: 365 days standard → 365 days Glacier → expire
#     after 7 years (covers BIR audit forensics window).
#   - Public access fully blocked.
#   - Versioned (defense-in-depth against accidental deletion).
#   - TLS-only.

variable "log_bucket_name" {
  description = "Globally unique S3 access log bucket name (e.g. onservice-s3-access-logs-prod)."
  type        = string
  default     = "onservice-s3-access-logs"
}

resource "aws_s3_bucket" "access_logs" {
  bucket        = "${var.log_bucket_name}-${var.environment}"
  force_destroy = false # never destroy logs accidentally

  tags = {
    Environment = var.environment
    Purpose     = "S3 server access logs"
    Compliance  = "MED-O03"
  }
}

resource "aws_s3_bucket_versioning" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

# AWS S3 access-log delivery requires the canonical "S3 Log Delivery"
# group ACL OR a bucket policy granting s3:PutObject from logging.s3.amazonaws.com.
# Use the policy approach — ACLs are deprecated.
resource "aws_s3_bucket_ownership_controls" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket                  = aws_s3_bucket.access_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    id     = "tier-then-expire"
    status = "Enabled"

    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555 # 7 years (covers BIR audit window + safety margin)
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# TLS-only + grant logging service permission to write.
resource "aws_s3_bucket_policy" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.access_logs.arn,
          "${aws_s3_bucket.access_logs.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
      {
        Sid       = "AllowS3LogDelivery"
        Effect    = "Allow"
        Principal = { Service = "logging.s3.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.access_logs.arn}/*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
          ArnLike = {
            "aws:SourceArn" = [
              # Allow both buckets in this terraform module to write logs here.
              aws_s3_bucket.bir_receipts.arn,
              aws_s3_bucket.uploads.arn,
            ]
          }
        }
      },
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.access_logs]
}

# Per-bucket logging configuration. Both source buckets log into
# the shared log bucket under different prefixes so audits can scope
# their queries.

resource "aws_s3_bucket_logging" "bir_receipts" {
  bucket        = aws_s3_bucket.bir_receipts.id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "bir-receipts/"
}

resource "aws_s3_bucket_logging" "uploads" {
  bucket        = aws_s3_bucket.uploads.id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "uploads/"
}

output "access_logs_bucket_name" {
  value = aws_s3_bucket.access_logs.id
}

output "access_logs_bucket_arn" {
  value = aws_s3_bucket.access_logs.arn
}
