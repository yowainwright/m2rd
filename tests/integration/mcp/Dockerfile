FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1

RUN npm install --global --ignore-scripts shadcn@4.21.2 \
    && npm cache clean --force

WORKDIR /workspace
USER node
ENTRYPOINT ["shadcn", "mcp"]
