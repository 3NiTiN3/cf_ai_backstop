# Backstop

A resilience gateway that keeps AI coding agents working when GitHub is slow or down. It caches and coalesces reads, detects outages, serves stale data safely, and queues writes for replay when GitHub recovers. Built on Cloudflare Workers, Durable Objects, Workflows and Workers AI.

Live: https://cf-ai-backstop.gambier-toad-0c.workers.dev

Work in progress. A full write-up with architecture, setup instructions and results will land here once the build is further along.
