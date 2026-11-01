# Private encrypted staging backup archive acceptance

**Not executed on a real backup.** This is a local private-operator verification step for [recovery gate #78](https://github.com/hydedfeg/TGReposter/issues/78), not a backup, restore, payment activation or production operation.

After the approved operator-only snapshot capture, the private folder contains matching files named `staging-<timestamp>.dump.age` and `staging-<timestamp>.reference.json`. The latter contains the encrypted archive's SHA-256 and 46-migration/12-tenant-table metadata fingerprints.

The additional verifier `scripts/verifyStagingEncryptedArchive.ts`:
1. Requires absolute archive/reference/age identity file paths outside the Git repository; the matching archive/reference must share a private directory. Symlinks, nonregular files, missing files and shared-readable files are denied.
2. Validates the manifest's staging project, exact capture method, archive name, PostgreSQL 17, and migration/tenant footprint counts. This is metadata validation, not independent proof that the manifest is trustworthy.
3. Streams the encrypted archive through SHA-256 and compares against the reference; any mismatch stops inspection.
4. Uses the local age identity to decrypt into a pipe connected to `pg_restore --list`. Standard output and standard error from subprocesses are suppressed; no plaintext dump or TOC is written to disk or printed, and no PostgreSQL connection is made. Both subprocesses must succeed. After pg_restore reads the archive header/TOC, remaining ciphertext is drained to complete decryption.

## Operator procedure

On a trusted private workstation, first complete the authorized snapshot capture documented in `docs/STAGING_PRIVATE_SNAPSHOT_BACKUP_CAPTURE.md`. Retain the matching encrypted archive, manifest and private age identity only in access-controlled storage. Do not send any of these files, passwords or key material to chat, CI, Railway or the repository.

Install the matching PostgreSQL 17 client tools (including `pg_restore`), `age` and locked Node dependencies. Set `STAGING_ARCHIVE_REFERENCE_FILE`, `STAGING_ENCRYPTED_ARCHIVE_FILE`, `STAGING_ARCHIVE_AGE_IDENTITY_FILE` to the local absolute private paths. Execute:

```bash
npx --no-install tsx scripts/verifyStagingEncryptedArchive.ts --verify
```

The command is **read-only and offline**; it does not create or restore a database. Store the original checksum independently under a trusted recovery record, since anyone with write access to both the archive and its JSON reference could change both. An age/TOC pass does **not** prove data rows, extensions, global roles, Auth, Storage or end-to-end recovery.

**Next P0 gate:** restore the validated encrypted archive into a separately authorized, egress-isolated PostgreSQL/Supabase-compatible environment and run `scripts/verifyRestoredStagingDatabase.ts` with the matching private snapshot reference. No backup or actual restore has been executed through this change.

References: [PostgreSQL 17 pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [age user manual](https://github.com/FiloSottile/age).
