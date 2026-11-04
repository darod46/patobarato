FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
RUN pip install .

RUN useradd --create-home --uid 1000 bot \
    && mkdir -p /app/data \
    && chown bot:bot /app/data
USER bot

ENTRYPOINT ["python", "-m", "patobarato"]
CMD ["run"]
