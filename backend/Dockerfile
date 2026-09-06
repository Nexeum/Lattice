# Shared image for all four Lattice backend services (auth, containers, rooms, packages).
# Each docker-compose service overrides the command with its own uvicorn target/port.
FROM python:3.13-slim

# The containers service shells out to the docker CLI (`docker ps`, `docker stats`, ...)
# in addition to using docker-py, so ship the static CLI binary inside the image.
COPY --from=docker:cli /usr/local/bin/docker /usr/local/bin/docker

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default command (auth service); overridden per-service in docker-compose.yml
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5005"]
