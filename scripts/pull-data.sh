#!/usr/bin/env bash
# Pull the organisers' datasets and the ČNB FX rates into data/raw/ (git-ignored).
set -euo pipefail

BUCKET="${HACKATHON_DATASETS_BUCKET:-ai-hackathon-datasets-422928733782}"
REGION="eu-central-1"
FX_YEAR="2026"
FX_URL="https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/rok.txt?rok=${FX_YEAR}"
FOLDERS=(CNB MostlyRIght)
PROFILE="${AWS_PROFILE:-}"
FETCH_FX=1

usage() {
  cat <<EOF
Usage: scripts/pull-data.sh [--profile NAME] [--no-fx] [FOLDER...]

Syncs the shared hackathon datasets from S3 into data/raw/ and downloads the
ČNB daily FX fixings for ${FX_YEAR} into data/raw/cnb-fx/.

  --profile NAME  AWS CLI profile for the team account (default: \$AWS_PROFILE)
  --no-fx         skip the ČNB FX download
  FOLDER...       bucket folders to sync (default: ${FOLDERS[*]})
  -h, --help      show this help

Sign in first: aws sso login --profile NAME
Override the bucket with HACKATHON_DATASETS_BUCKET.
EOF
}

args=()
while (($#)); do
  case "$1" in
    --profile) PROFILE="${2:?--profile needs a value}"; shift 2 ;;
    --no-fx) FETCH_FX=0; shift ;;
    -h | --help) usage; exit 0 ;;
    --) shift ;;
    -*) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
((${#args[@]})) && FOLDERS=("${args[@]}")

if [[ -z "$PROFILE" ]]; then
  echo "No AWS profile. Pass --profile NAME or set AWS_PROFILE." >&2
  exit 2
fi
command -v aws >/dev/null || { echo "aws CLI not found." >&2; exit 1; }

if ! aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1; then
  echo "No valid session for profile '$PROFILE'. Run: aws sso login --profile $PROFILE" >&2
  exit 1
fi

DEST="$(git rev-parse --show-toplevel)/data/raw"
mkdir -p "$DEST"

for folder in "${FOLDERS[@]}"; do
  echo "Syncing s3://$BUCKET/$folder/ -> data/raw/$folder/"
  aws s3 sync "s3://$BUCKET/$folder/" "$DEST/$folder/" \
    --region "$REGION" --profile "$PROFILE" --only-show-errors
done

if ((FETCH_FX)); then
  echo "Downloading ČNB FX fixings for $FX_YEAR -> data/raw/cnb-fx/"
  mkdir -p "$DEST/cnb-fx"
  curl -fsSL "$FX_URL" -o "$DEST/cnb-fx/rok-$FX_YEAR.txt"
fi

echo "Done:"
find "$DEST" -type f \( -name '*.csv' -o -name '*.txt' \) -exec wc -l {} + | sed "s#$DEST/#  #"
