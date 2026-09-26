# Backend error codes

Stable, lowercase snake_case codes returned as `code` (and `fieldCodes[field]`)
alongside the existing human `error` / `fields` messages. The app looks these
up to show a translated message; `params`, when present, fill placeholders in
that translation.

One code per line, with its English message (params in parentheses).

validation — Please fix the highlighted fields.
job_category_required — Choose a service.
job_description_length — Describe the work in 10–500 characters.
job_photos_required — Add at least one photo of the work.
job_photos_max — Add at most {max} photos. (params: max)
job_photos_invalid — A photo didn’t upload correctly. Please remove it and add it again.
job_price_range — Enter a price between ₹50 and ₹1,00,000.
job_duration_range — Enter a duration between 15 minutes and 7 days.
job_address_length — Enter the address in 5–300 characters.
job_location_invalid — We couldn’t read your location. Please allow location access.
job_language_invalid — Unsupported language.
job_not_found — Job not found
job_unavailable — This job is no longer available.
job_cannot_start — This job can’t be started.
job_start_code_wrong — Wrong code. {left} tries left. (params: left)
job_start_code_too_many — Too many wrong codes. Withdraw from this job so another worker can be found.
job_cannot_complete — Only a job in progress can be completed.
job_cannot_withdraw — You can only withdraw from a job you haven’t started.
job_cannot_cancel — This job can no longer be cancelled.
job_create_failed — Could not post your job.
job_load_failed — Could not load the job.
job_update_failed — Could not update the job.
feedback_already — You’ve already rated this job.
feedback_not_completed — You can rate the worker once the job is completed.
worker_busy — Finish your current job before accepting another.
worker_not_registered — Not registered as a worker
offer_closed — This offer is no longer open.
