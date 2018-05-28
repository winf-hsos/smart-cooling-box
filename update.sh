#!/bin/bash
git fetch --all
git reset --hard origin/master
chmod -R 777 .
chmod u+x update.sh