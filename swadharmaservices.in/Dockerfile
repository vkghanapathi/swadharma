# swadharmaservices.in — static site on Cloud Run (service `swadharmaservices`).
#
#   gcloud run deploy swadharmaservices --source swadharma_services_website \
#     --project swadharma-service-management --region asia-south1 \
#     --allow-unauthenticated --port 8080
#
# This file exists because the deployed revision was previously built from an
# ad-hoc directory that lived on someone's laptop — Dockerfile, nginx.conf and a
# public/ folder that the repo did not contain. Recovering it meant downloading
# the source zip Cloud Run had kept in GCS. Now the command above works from a
# clean checkout.
#
# Only *.html and *.css are copied. The same folder holds DEPLOY_RUNBOOK.md,
# ONBOARDING_API.md and PROFESSIONAL_ENROLMENT_API.md — internal notes and API
# contracts that would otherwise be served to anyone who guessed the filename.
# Adding a broad `COPY . .` here would publish them.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY *.html *.css /usr/share/nginx/html/

EXPOSE 8080
