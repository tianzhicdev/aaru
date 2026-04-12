-- Fire-and-poll: add processing_request_id for last-write-wins concurrency
ALTER TABLE users ADD COLUMN processing_request_id uuid;
