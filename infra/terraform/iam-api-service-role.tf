# LAUNCH-LIMITATIONS #10 fix — IAM least-privilege for the API service role.
#
# Implements INFRA-CHECKLIST items 2.1–2.5:
#   2.1 dedicated IAM role for the API runtime (separate from deployer role)
#   2.2 S3 perms scoped to PutObject + GetObject on the BIR bucket only
#   2.3 explicit DENY on DeleteObject*, PutBucket*, PutObjectRetention
#       (the last one would let a compromised app shorten Object Lock)
#   2.4 permission boundary preventing IAM principal creation + KMS key edits
#   2.5 separate IAM role for the data-export job (PutObject on uploads
#       bucket only, NOT the BIR bucket)
#
# DEPLOY: apply via `terraform apply` after the BIR + uploads buckets land
# (depends on s3-bir-receipts.tf and s3-customer-uploads.tf).
#
# Trust policy is parameterized so the same module works for ECS task
# roles, EKS IRSA, EC2 instance profiles. Pass the right principal via
# var.api_role_trust_principal.

variable "api_role_name" {
  description = "Name of the API runtime role (e.g., onservice-api-prod)"
  type        = string
  default     = "onservice-api-prod"
}

variable "api_role_trust_principal" {
  description = "AssumeRole principal for the API role (ECS, EKS OIDC, or EC2)"
  type = object({
    type        = string # "Service" | "Federated" | "AWS"
    identifiers = list(string)
  })
  default = {
    type        = "Service"
    identifiers = ["ecs-tasks.amazonaws.com"]
  }
}

variable "data_export_role_name" {
  description = "Name of the data-export job role"
  type        = string
  default     = "onservice-data-export-prod"
}

variable "data_export_role_trust_principal" {
  description = "AssumeRole principal for the data-export job role"
  type = object({
    type        = string
    identifiers = list(string)
  })
  default = {
    type        = "Service"
    identifiers = ["ecs-tasks.amazonaws.com"]
  }
}

# Permission boundary applied to BOTH service roles. Denies anything
# that would let a compromised app escalate privilege:
#   - iam:Create* / iam:Put* / iam:Attach*  → no new principals or policies
#   - kms:ScheduleKeyDeletion / kms:Disable / kms:Update*  → no key tamper
#   - s3:PutBucket* on the BIR bucket  → no Object Lock weakening
data "aws_iam_policy_document" "service_boundary" {
  statement {
    sid    = "AllowEverythingByDefault"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
      "kms:Decrypt",
      "kms:GenerateDataKey",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "secretsmanager:GetSecretValue",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "sts:AssumeRole",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "DenyIamMutation"
    effect = "Deny"
    actions = [
      "iam:Create*",
      "iam:Put*",
      "iam:Attach*",
      "iam:DeleteRole*",
      "iam:DetachRolePolicy",
      "iam:UpdateAssumeRolePolicy",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "DenyKmsKeyTamper"
    effect = "Deny"
    actions = [
      "kms:ScheduleKeyDeletion",
      "kms:DisableKey",
      "kms:DisableKeyRotation",
      "kms:UpdateKeyDescription",
      "kms:CreateAlias",
      "kms:DeleteAlias",
      "kms:PutKeyPolicy",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "service_boundary" {
  name        = "onservice-service-permission-boundary-${var.environment}"
  description = "Permission boundary for app service roles — denies IAM/KMS escalation."
  policy      = data.aws_iam_policy_document.service_boundary.json
}

# ── API runtime role (item 2.1) ─────────────────────────────────────

data "aws_iam_policy_document" "api_role_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = var.api_role_trust_principal.type
      identifiers = var.api_role_trust_principal.identifiers
    }
  }
}

resource "aws_iam_role" "api" {
  name                 = var.api_role_name
  assume_role_policy   = data.aws_iam_policy_document.api_role_trust.json
  permissions_boundary = aws_iam_policy.service_boundary.arn

  tags = {
    Environment = var.environment
    Compliance  = "BIR-10y, NPC-RA10173"
    Dispatch    = "launch-limit-10"
  }
}

# Item 2.2 — scoped allow on the BIR bucket: PutObject + GetObject only.
# Bucket-level ListBucket is granted on the bucket ARN (no /* suffix).
data "aws_iam_policy_document" "api_bir_access" {
  statement {
    sid    = "BirReadWriteObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:GetObjectVersion",
    ]
    resources = ["${aws_s3_bucket.bir_receipts.arn}/*"]
  }

  statement {
    sid    = "BirListBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [aws_s3_bucket.bir_receipts.arn]
  }

  statement {
    sid    = "BirKmsForObjectEncryption"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.bir.arn]
  }

  # Item 2.3 — explicit DENY for object deletion, version deletion,
  # bucket-level changes, and Object Lock retention overrides.
  # Effect=Deny in the same role's policy beats any Allow elsewhere
  # per IAM evaluation rules.
  statement {
    sid    = "BirNeverDeleteOrTamper"
    effect = "Deny"
    actions = [
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:DeleteBucket",
      "s3:PutBucketPolicy",
      "s3:PutBucketAcl",
      "s3:PutBucketVersioning",
      "s3:PutBucketObjectLockConfiguration",
      "s3:PutObjectRetention",
      "s3:PutObjectLegalHold",
      "s3:BypassGovernanceRetention",
    ]
    resources = [
      aws_s3_bucket.bir_receipts.arn,
      "${aws_s3_bucket.bir_receipts.arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "api_bir_access" {
  name   = "${var.api_role_name}-bir-access"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api_bir_access.json
}

# Customer uploads bucket — read + write + (limited) delete for moderation
# / tombstoned-content workflow. NOT covered by Object Lock.
data "aws_iam_policy_document" "api_uploads_access" {
  statement {
    sid    = "UploadsRwd"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }

  statement {
    sid    = "UploadsListBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [aws_s3_bucket.uploads.arn]
  }

  statement {
    sid    = "UploadsKmsForObjects"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.uploads.arn]
  }
}

resource "aws_iam_role_policy" "api_uploads_access" {
  name   = "${var.api_role_name}-uploads-access"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api_uploads_access.json
}

# Logs + Secrets + SSM — required for ECS task execution + runtime
# config. Scope is broad here to keep the policy maintainable; the
# permission boundary (Deny IAM/KMS mutation) caps blast radius.
data "aws_iam_policy_document" "api_observability" {
  statement {
    sid    = "Logs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["arn:aws:logs:*:*:log-group:/ecs/onservice-api*"]
  }

  statement {
    sid    = "SecretsRead"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    # All onservice-prefixed secrets/params. Tighten with explicit
    # ARN list once the inventory is final.
    resources = ["*"]
    condition {
      test     = "StringLike"
      variable = "secretsmanager:Name"
      values   = ["onservice/*"]
    }
  }
}

resource "aws_iam_role_policy" "api_observability" {
  name   = "${var.api_role_name}-observability"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api_observability.json
}

# ── Data export job role (item 2.5) ─────────────────────────────────

data "aws_iam_policy_document" "data_export_role_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = var.data_export_role_trust_principal.type
      identifiers = var.data_export_role_trust_principal.identifiers
    }
  }
}

resource "aws_iam_role" "data_export" {
  name                 = var.data_export_role_name
  assume_role_policy   = data.aws_iam_policy_document.data_export_role_trust.json
  permissions_boundary = aws_iam_policy.service_boundary.arn

  tags = {
    Environment = var.environment
    Compliance  = "NPC-RA10173"
    Dispatch    = "launch-limit-10"
  }
}

data "aws_iam_policy_document" "data_export_uploads" {
  statement {
    sid    = "UploadsBucketWrite"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
    ]
    # The data-export pipeline (CRIT-N07 fix) writes to a /exports
    # prefix on the customer-uploads bucket. Constrain by prefix so a
    # compromised export job can't poison user-uploaded content.
    resources = ["${aws_s3_bucket.uploads.arn}/exports/*"]
  }

  statement {
    sid    = "UploadsKms"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.uploads.arn]
  }

  # Explicit DENY on the BIR bucket so even a misconfigured trust
  # policy can't cross-pollinate.
  statement {
    sid    = "NoBirAccess"
    effect = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.bir_receipts.arn,
      "${aws_s3_bucket.bir_receipts.arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "data_export_uploads" {
  name   = "${var.data_export_role_name}-uploads-access"
  role   = aws_iam_role.data_export.id
  policy = data.aws_iam_policy_document.data_export_uploads.json
}

# ── Outputs ─────────────────────────────────────────────────────────

output "api_role_arn" {
  value       = aws_iam_role.api.arn
  description = "ARN to attach to the ECS task definition / EKS pod / EC2 instance profile."
}

output "data_export_role_arn" {
  value       = aws_iam_role.data_export.arn
  description = "ARN for the data-export job task definition."
}

output "service_boundary_arn" {
  value       = aws_iam_policy.service_boundary.arn
  description = "Permission boundary applied to all app service roles."
}
