SECURITY_PATTERNS = {
    "postinstall": {
        "title": "Suspicious postinstall script detected",
        "steps": [
            "Inspect the postinstall script content",
            "Verify the script source and repository history",
            "Check npm audit and security advisories",
            "Disable or remove the script if unnecessary",
        ],
        "code": [
            "npm config set ignore-scripts true",
            "npm install --ignore-scripts",
        ],
    }
}

CRASH_PATTERNS = {
    "crash": {
        "title": "Application crash issue",
        "steps": [
            "Reproduce the crash locally",
            "Check stack trace and error logs",
            "Verify dependency versions",
            "Apply fix or upgrade dependency",
        ],
    }
}

GENERIC_FIX = {
    "steps": [
        "Understand the root cause of the issue",
        "Search for similar resolved issues",
        "Apply the fix incrementally",
        "Add tests to prevent regression",
    ]
}
