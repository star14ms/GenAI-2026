# Deploy with env from ../.env. Run: make build && make deploy
# Requires .env with VAR=value (no spaces around =)
deploy:
	@set -a && [ -f ../.env ] && . ../.env && set +a; \
	sam deploy --parameter-overrides \
		OpenAiApiKey="$${OPENAI_API_KEY}" \
		OpenAiBaseUrl="$${OPENAI_BASE_URL}" \
		OpenAiModel="$${OPENAI_MODEL}" \
		AlpacaApiKey="$${ALPACA_API_KEY}" \
		AlpacaSecretKey="$${ALPACA_SECRET_KEY}"

# Full deployment (chat + stocks). Requires Docker. Run: make build && make deploy
# DOCKER_DEFAULT_PLATFORM=linux/amd64 for Mac M1/M2 (Lambda runs x86_64)
build:
	cp requirements-full.txt requirements.txt
	DOCKER_DEFAULT_PLATFORM=linux/amd64 sam build
	cp requirements-full.txt requirements.txt

# Zip fallback (chat only, no Docker). Use if Docker fails. Run: make build-zip && sam deploy
build-zip:
	cp requirements-lambda.txt requirements.txt
	sam build -t template-zip.yaml
	cp requirements-full.txt requirements.txt
