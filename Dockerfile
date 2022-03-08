# Build:                   sudo docker build --no-cache . -t cacophony-api
# Run interactive session: sudo docker run -it cacophony-api

FROM cacophonyproject/server-base:4

WORKDIR /app

# API
EXPOSE 1080

# API - fileProcessing
EXPOSE 2008

# Minio
EXPOSE 9001

# Node Debugger
EXPOSE 9228

# PostgreSQL
EXPOSE 5432

COPY docker-entrypoint.sh /

COPY api ./api

COPY types ./types

RUN cd api && npm install

ENTRYPOINT ["/docker-entrypoint.sh"]
