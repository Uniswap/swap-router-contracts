#!/usr/bin/env bash
git clone https://github.com/matter-labs/local-setup.git
cd local-setup
git checkout 1c016dcd143c42c2ecf696209155bb1efee842ef

rm -rf ./volumes
mkdir -p ./volumes
mkdir -p ./volumes/postgres ./volumes/geth ./volumes/zksync/env/dev ./volumes/zksync/data

docker-compose down -v
docker-compose pull
docker-compose up -d
