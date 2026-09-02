# biome: lint + format in one tool (lint --write applies safe fixes incl. formatting)
default:
	@just --list

# Apply lint autofixes and formatting (biome check --write)
fmt:
	npm run lint:fix

# Full check suite: lint, typecheck, tests, build (matches AGENTS.md "complete check suite")
check:
	npm run lint
	npm run typecheck
	npm test
	npm run build

# Run tests once (vitest run)
test:
	npm test
