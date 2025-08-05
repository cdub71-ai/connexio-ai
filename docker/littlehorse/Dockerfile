FROM ghcr.io/littlehorse-enterprises/littlehorse/lh-standalone:0.14.1

# Set environment variables
ENV LH_HOME=/opt/littlehorse
ENV LH_CONFIG_FILE=/opt/littlehorse/config/littlehorse.config

# Create directories for custom config
RUN mkdir -p ${LH_HOME}/config ${LH_HOME}/data ${LH_HOME}/logs

# Copy configuration files
COPY config/ ${LH_HOME}/config/

# Expose ports
EXPOSE 2023 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9090/health || exit 1