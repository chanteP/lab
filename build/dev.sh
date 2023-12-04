set -e

APP_PAGE=$1

pack ./src/$APP_PAGE/index.ts --raw .glsl --html
