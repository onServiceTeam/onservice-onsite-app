# Bug 1325 fix verified.
# Phase 14 Dispatch 01.
#
# S3 bucket for customer + provider uploads (avatars, before/after photos,
# evidence). Default bucket-level SSE-KMS with a customer-managed key,
# public access fully blocked, TLS-only bucket policy, lifecycle to expire
# orphaned multipart uploads, and a deny-rule for any PutObject that
# doesn't carry an SSE header (so the API server cannot accidentally write
# unencrypted objects even if a future code change drops the SSE param).
#
# Key configuration knobs are exposed as variables so prod and staging can
# share the module with different bucket names and key admins.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "bucket_name" {
  description = "Globally unique S3 bucket name (e.g. onservice-uploads-prod)."
  type        = string
}

variable "kms_key_admins" {
  description = "IAM principals allowed to administer the KMS key (rotate, schedule deletion)."
  type        = list(string)
  default     = []
}

variable "kms_key_users" {
  description = "IAM principals allowed to use the KMS key for encrypt/decrypt (the API task role)."
  type        = list(string)
}

variable "force_destroy" {
  description = "Allow Terraform to delete the bucket even if non-empty. Keep false in production."
  type        = bool
  default     = false
}

# --- Customer-managed KMS key for SSE-KMS -----------------------------------

resource "aws_kms_key" "uploads" {
  description             = "SSE-KMS key for ${var.bucket_name}. Bug 1325."
  enable_key_rotation     = true
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid       = "EnableRootAccountPermissions"
          Effect    = "Allow"
          Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
          Action    = "kms:*"
          Resource  = "*"
        }
      ],
      length(var.kms_key_admins) > 0 ? [
        {
          Sid       = "AllowKeyAdministration"
          Effect    = "Allow"
          Principal = { AWS = var.kms_key_admins }
          Action = [
            "kms:Create*",
            "kms:Describe*",
            "kms:Enable*",
            "kms:List*",
            "kms:Put*",
            "kms:Update*",
            "kms:Revoke*",
            "kms:Disable*",
            "kms:Get*",
            "kms:Delete*",
            "kms:TagResource",
            "kms:UntagResource",
            "kms:ScheduleKeyDeletion",
            "kms:CancelKeyDeletion",
            "kms:RotateKeyOnDemand",
          ]
          Resource = "*"
        }
      ] : [],
      [
        {
          Sid       = "AllowKeyUseByApi"
          Effect    = "Allow"
          Principal = { AWS = var.kms_key_users }
          Action = [
            "kms:Encrypt",
            "kms:Decrypt",
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*",
            "kms:DescribeKey",
          ]
          Resource = "*"
        }
      ],
    )
  })
}

resource "aws_kms_alias" "uploads" {
  name          = "alias/${var.bucket_name}"
  target_key_id = aws_kms_key.uploads.id
}

data "aws_caller_identity" "current" {}

# --- Bucket -----------------------------------------------------------------

resource "aws_s3_bucket" "uploads" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy

  tags = {
    Name        = var.bucket_name
    BugFix      = "1325"
    Phase       = "14"
    Dispatch    = "01"
    DataClass   = "user-content"
    Encryption  = "SSE-KMS"
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.uploads.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "expire-old-noncurrent-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# Bucket policy: deny non-TLS, deny any PutObject lacking SSE.
# Bug 1325: this is the structural defense — even if the application code
# regresses and stops sending SSE headers, the bucket itself rejects the
# write.
resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.uploads.arn,
          "${aws_s3_bucket.uploads.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
      {
        Sid       = "DenyUnencryptedPut"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.uploads.arn}/*"
        Condition = {
          "Null" = { "s3:x-amz-server-side-encryption" = "true" }
        }
      },
      {
        Sid       = "DenyWrongEncryptionAlgorithm"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.uploads.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = ["aws:kms", "AES256"]
          }
        }
      },
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.uploads]
}

output "bucket_name" {
  value = aws_s3_bucket.uploads.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.uploads.arn
}

output "kms_key_arn" {
  value = aws_kms_key.uploads.arn
}

output "kms_key_id" {
  value = aws_kms_key.uploads.id
}
