#!/usr/bin/env python3
"""
Set GitHub Actions secrets using the GitHub API.
Requires: pynacl, requests
"""

import os
import sys
import json
import base64
import requests
from nacl import encoding, public

def encrypt_secret(public_key: str, secret_value: str) -> str:
    """Encrypt a secret using the repo's public key."""
    public_key_bytes = public.PublicKey(public_key.encode("utf-8"), encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key_bytes)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")

def set_secret(repo: str, token: str, secret_name: str, secret_value: str):
    """Set a GitHub Actions secret."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }

    # Get public key
    key_response = requests.get(
        f"https://api.github.com/repos/{repo}/actions/secrets/public-key",
        headers=headers
    )
    key_data = key_response.json()

    # Encrypt the secret
    encrypted_value = encrypt_secret(key_data["key"], secret_value)

    # Set the secret
    response = requests.put(
        f"https://api.github.com/repos/{repo}/actions/secrets/{secret_name}",
        headers=headers,
        json={
            "encrypted_value": encrypted_value,
            "key_id": key_data["key_id"]
        }
    )

    if response.status_code in [201, 204]:
        print(f"✓ Set secret: {secret_name}")
        return True
    else:
        print(f"✗ Failed to set {secret_name}: {response.status_code} {response.text}")
        return False

def main():
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()

    repo = os.getenv("GITHUB_REPO")
    token = os.getenv("GITHUB_TOKEN")

    if not repo or not token:
        print("Error: GITHUB_REPO and GITHUB_TOKEN must be set")
        sys.exit(1)

    # Secrets to set
    secrets = {
        "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
        "SLACK_BOT_TOKEN": os.getenv("SLACK_BOT_TOKEN"),
        "SLACK_SIGNING_SECRET": os.getenv("SLACK_SIGNING_SECRET"),
        "SLACK_INBOX_CHANNEL_ID": os.getenv("SLACK_INBOX_CHANNEL_ID"),
        "SLACK_WEEKLY_CHANNEL_ID": os.getenv("SLACK_WEEKLY_CHANNEL_ID"),
        "SLACK_MONTHLY_CHANNEL_ID": os.getenv("SLACK_MONTHLY_CHANNEL_ID"),
        "SLACK_USER_ID": os.getenv("SLACK_USER_ID"),
    }

    success_count = 0
    for name, value in secrets.items():
        if value:
            if set_secret(repo, token, name, value):
                success_count += 1
        else:
            print(f"⚠ Skipping {name}: not set in environment")

    print(f"\nSet {success_count}/{len(secrets)} secrets")

if __name__ == "__main__":
    main()
