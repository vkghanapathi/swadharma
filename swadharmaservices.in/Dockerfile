# swadharmaservices.in — static site on Cloud Run (service `swadharmaservices`).
#
# From the repository root:
#
#   gcloud run deploy swadharmaservices --source swadharmaservices.in \
#     --project swadharma-service-management --region asia-south1 \
#     --allow-unauthenticated --port 8080
#
# The source directory is the one holding this file. An earlier version of this
# comment named `swadharma_services_website`, a stale copy of the pages that
# carries no Dockerfile — running it that way builds the wrong tree.
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

# One pattern per COPY. Docker fails the build if a wildcard matches nothing, so
# a single `COPY *.html *.css` would abort on a missing stylesheet with an error
# naming both patterns. Split, the message points at the one that matched
# nothing. Failing is the right outcome either way: doc.css styles enrol,
# manual and privacy, and a site with no HTML is not a state worth shipping.
COPY *.html /usr/share/nginx/html/
COPY *.css /usr/share/nginx/html/

EXPOSE 8080
