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
job_start_code_wrong_last — Wrong code.
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
worker_inactive — Your worker account isn’t active.
worker_offline — You are offline.
worker_load_failed — Could not load your worker information. (shared: profile/offers/insights load failures)
worker_update_failed — Could not update your worker information. (shared: profile save/online/heartbeat/offline/deregister/dismiss-prompt failures)
worker_register_failed — Could not register you as a worker.
worker_skills_required — Choose at least one service you offer.
worker_skills_max — Choose at most {max} services. (params: max)
worker_skills_invalid — Choose services from the list.
worker_bio_length — Keep your introduction under 300 characters.
worker_experience_invalid — Enter your experience in whole years.
worker_radius_invalid — Choose a distance between 1 and 25 km.
profile_save_failed — Could not save your profile.
offer_closed — This offer is no longer open.
worker_name_required — Enter your full name.
worker_income_required — Choose your yearly income.
worker_categories_required — Choose at least one kind of work.
worker_categories_max — Choose up to {max} kinds of work. (params: max)
worker_categories_unavailable — Some of the chosen work types are not available.
AADHAAR_REQUIRED — Verify your Aadhaar with DigiLocker before taking jobs. (uppercase legacy code, unchanged)
NOT_REGISTERED — Register as a worker first. (uppercase legacy code, unchanged)
profile_name_invalid — Enter your full name (letters only).
profile_dob_invalid — Enter a valid date as DD/MM/YYYY.
profile_gender_invalid — Choose a gender.
profile_address_length — Enter your full address.
profile_phone_invalid — Enter a valid 10-digit mobile number.
profile_city_length — Enter your city.
profile_pincode_invalid — Enter a valid 6-digit PIN code.
profile_language_invalid — Choose a supported language.
profile_location_invalid — Could not read your location. Please try again.
profile_identity_locked — Verified from Aadhaar — this can’t be changed.
feedback_rating_invalid — Choose a rating from 1 to 5 stars.
feedback_praised_invalid — Choose what went well from the list.
feedback_criticized_invalid — Choose what could be better from the list.
feedback_traits_conflict — Something can’t be both good and bad — pick one.
feedback_rehire_invalid — Answer yes or no.
feedback_comment_length — Keep your comment under 500 characters.
heatmap_workers_only — Register as a worker to see where the work is.
heatmap_bounds_invalid — Map bounds are missing or invalid.
heatmap_area_too_large — Zoom in to a city to see the map.
heatmap_load_failed — Could not load the map.
