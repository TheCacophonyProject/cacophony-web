// TODO

// Steps:
// 1. Create "model" column, and migrate { name } to it. (do the migration manually on both prod and test)
// 2. Create "start_s" and "end_s" columns on Tracks, and migrate data from jsonb into that.  Actually, we probably only need a single "duration" field.
// 3. Modify any queries that rely on querying into jsonb date to use the new column.
// 4. Any queries that need the jsonb data should first look for an s3 object with the appropriate key, and fallback to the jsonb column. (or the other way around?)
// 5. In batches, save the jsonb datas to gzipped object storage
