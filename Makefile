.PHONY: help up down db api web mcp agntid supportops

help:
	@echo "Workspace targets"
	@echo "  make up          SupportOps Postgres, migrations, seed, then API, web, and MCP in the background"
	@echo "  make db          SupportOps Postgres only"
	@echo "  make api         SupportOps API only"
	@echo "  make web         SupportOps web only"
	@echo "  make mcp         SupportOps MCP server only"
	@echo "  make agntid      existing AgntID runtime compose at the repo root"
	@echo "  make down        stop SupportOps Postgres and the AgntID runtime compose"

up supportops:
	$(MAKE) -C supportops-ai up

db api web mcp:
	$(MAKE) -C supportops-ai $@

agntid:
	docker compose up -d

down:
	$(MAKE) -C supportops-ai down
	docker compose down
