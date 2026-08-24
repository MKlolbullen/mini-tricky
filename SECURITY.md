# Security Policy

mini-tricky is an offensive-security workflow orchestrator. Bugs involving command execution, local API access, filesystem access, secrets, workflow imports, or Electron IPC can have unusually high impact and should be handled as security issues.

## Supported versions

Security fixes are developed against the current `main` branch and the latest published beta release.

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability that could expose secrets, execute commands unexpectedly, escape the intended workflow boundary, or allow a malicious web page/process to control the local mini-tricky service.

Use GitHub's **Private vulnerability reporting / Security Advisories** for this repository when available. Include:

- affected version or commit;
- operating system and run mode (Electron or web);
- a minimal reproduction;
- expected vs. actual behavior;
- security impact;
- relevant logs or request/response data with secrets removed.

If private reporting is unavailable, contact the maintainer through the repository owner's GitHub profile and avoid publishing exploit details until a fix is available.

## High-priority security boundaries

Reports are especially useful around:

- Electron preload/IPC sender validation;
- local FastAPI and WebSocket access controls;
- CORS/origin handling;
- arbitrary file read/write paths;
- workflow import and custom-script execution;
- shell/argument construction and command injection;
- secret storage and masking;
- artifact path traversal;
- untrusted URLs passed to the operating system;
- release/update integrity and dependency supply chain.

## Safe research

Use isolated local test data and targets you are authorized to assess. Do not include third-party secrets, production credentials, or data from systems outside your authorization in reports.
