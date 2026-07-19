# AWS icon provenance

`architecture-service-icons/` is a complete copy of the AWS Architecture Service Icons
package dated 2026-04-30. Original category directories, size directories, and filenames
are preserved. The set contains 2,745 icon files: 1,220 SVG and 1,525 PNG files across
the original 16, 32, 48, and 64 size variants. Only macOS `.DS_Store` metadata was
excluded. `architecture-service-icons.SHA256SUMS` records every copied file.

The eleven SVG files directly under `assets/aws/` are convenient, stable shortcuts used
by the example gallery. They are unmodified copies of the corresponding `48` variants
from the complete set (64×64 viewBox with the official service color tile).

Icons are **optional presentation metadata** in sysgram: a node's meaning always comes
from its `kind`, `desc`, `facts`, and relationships — never from recognizing artwork.
Reference them via the spec's `iconCatalog`.

| Shortcut file | Original AWS asset | SHA-256 |
| --- | --- | --- |
| `amazon-cloudfront.svg` | `Arch_Networking-Content-Delivery/48/Arch_Amazon-CloudFront_48.svg` | `bdea6b292bb1b482f96b788d955adc2d84ce987ad1c2b7d6c719ae31ca7dbb94` |
| `amazon-cloudwatch.svg` | `Arch_Management-Tools/48/Arch_Amazon-CloudWatch_48.svg` | `9920f2db47fed7e2437c329e8b231edcb0f55db82f02413afa3f2d546c30d552` |
| `amazon-cognito.svg` | `Arch_Security-Identity/48/Arch_Amazon-Cognito_48.svg` | `66a89c507aced4afefe99d39fa7d5b7bd22e3f6bed03f511a031bf44f57f34ce` |
| `amazon-eventbridge.svg` | `Arch_Application-Integration/48/Arch_Amazon-EventBridge_48.svg` | `78f7fead59316ad6ac38cc262582bec81fc6649d0f6fdd5327708c08bede65e9` |
| `amazon-rds.svg` | `Arch_Databases/48/Arch_Amazon-RDS_48.svg` | `5ef651fae418df2ceade6bf9cbf779d8c8f2ec35c6ff47b23934b10722b6790e` |
| `amazon-s3.svg` | `Arch_Storage/48/Arch_Amazon-Simple-Storage-Service_48.svg` | `bb0df5b7ca52da7323888ed588baefa1c68a23b5776f325bc8ec29825c185a31` |
| `amazon-ses.svg` | `Arch_Business-Applications/48/Arch_Amazon-Simple-Email-Service_48.svg` | `69f4b5aa63b99f6e1c6ff814a585fb056da517270d1142be70088bb1ca2005d4` |
| `amazon-sqs.svg` | `Arch_Application-Integration/48/Arch_Amazon-Simple-Queue-Service_48.svg` | `5b3f5beb065cd76e4a6ac65a24437aee2bd51000f6b749bce69bbaba45d73b75` |
| `aws-fargate.svg` | `Arch_Containers/48/Arch_AWS-Fargate_48.svg` | `2b1b00e6e702e9bd1a1cc8bba077e05f214889c145186b9a44c28a74943b38ce` |
| `aws-lambda.svg` | `Arch_Compute/48/Arch_AWS-Lambda_48.svg` | `4a376abd2d67f8916791458810f3640b12fcfa71079154e0aed0974b92e58cdb` |
| `elastic-load-balancing.svg` | `Arch_Networking-Content-Delivery/48/Arch_Elastic-Load-Balancing_48.svg` | `8eca01663c238c8685ce5b397d2b0ef49c00ca963023ba7ee80866ed5a620b74` |

AWS product names, service marks, and icon artwork remain AWS property; keep files
unmodified and follow the AWS Architecture Icons and trademark guidance when publishing
diagrams that use them.
