# pi-workmap

# Default: the full gate.
default: check

# Format + autofix in src/ and test/.
fmt:
	npm run lint:fix

# Lint + typecheck (catches broken imports biome cannot see).
check:
	npm run lint
	npm run typecheck

# Test suite.
test:
	npm test

# Emit src/ to dist/.
build:
	npm run build

# The CI gate: lint + typecheck + test + build.
ci: check test build

# Regenerate the README screenshot (tmux + freeze + rsvg-convert).
screenshot:
	npm run docs:screenshot
