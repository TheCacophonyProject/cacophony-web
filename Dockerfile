# Build:                   sudo docker build --no-cache . -t cacophony-api
# Run interactive session: sudo docker run -it cacophony-api

FROM cacophonyproject/server-base:ubuntu2204_amd64
# Use for arm64 dev environments
#FROM cacophonyproject/server-base:ubuntu2204_arm64

WORKDIR /app

# API
EXPOSE 1080

# API - fileProcessing
EXPOSE 2008

# Minio
EXPOSE 9001

# Node Debugger
EXPOSE 9229

# PostgreSQL
EXPOSE 5432

COPY docker-entrypoint.sh /


ENTRYPOINT ["/docker-entrypoint.sh"]
