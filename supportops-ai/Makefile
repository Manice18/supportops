.PHONY: help up down db api web mcp install migrate seed reset dev

help:
	@echo "SupportOps targets"
	@echo "  make up        start Postgres, migrate, seed, then API, web, and MCP in the background"
	@echo "  make db        start Postgres on port 5433"
	@echo "  make api       start the Fastify API on port 4000"
	@echo "  make web       start the Next.js app on port 3000"
	@echo "  make mcp       start the MCP tool server on port 4050"
	@echo "  make migrate   apply Prisma migrations"
	@echo "  make seed      seed demo data"
	@echo "  make reset     clear and reseed the local demo database"
	@echo "  make down      stop API, web, MCP, and the SupportOps Postgres container"

install:
	pnpm install

db:
	docker compose up -d

down:
	@if [ -f logs/dev.pid ]; then \
		pid=$$(cat logs/dev.pid); \
		$(MAKE) --no-print-directory stop-tree PID=$$pid; \
		rm -f logs/dev.pid; \
	fi
	docker compose down

# PID is passed by `make down`. Walks children first so pnpm's dev processes exit.
stop-tree:
	@for child in $$(pgrep -P $(PID) 2>/dev/null); do \
		$(MAKE) --no-print-directory stop-tree PID=$$child; \
	done
	@kill $(PID) 2>/dev/null || true

migrate:
	pnpm db:migrate

seed:
	pnpm db:seed

reset:
	pnpm demo:reset

api:
	pnpm --filter @supportops/api dev

web:
	pnpm --filter @supportops/web dev

mcp:
	pnpm --filter @supportops/mcp dev

dev:
	pnpm dev

up: db
	pnpm db:migrate
	pnpm db:seed
	@mkdir -p logs
	@if [ -f logs/dev.pid ] && kill -0 $$(cat logs/dev.pid) 2>/dev/null; then \
		echo "SupportOps is already running."; \
	else \
		nohup pnpm dev >> logs/dev.log 2>&1 & echo $$! > logs/dev.pid; \
		echo "SupportOps is running in the background."; \
	fi
	@echo "  logs/api.log"
	@echo "  logs/web.log"
	@echo "  logs/mcp.log"
