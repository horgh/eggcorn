all: package.zip

clean:
	rm -rf build package.zip

package.zip: build node_modules eggcorn.js config.js
	rm -rf build/*
	cp -a eggcorn.js config.js node_modules build
	(cd build && zip -r ../package.zip .)

build:
	mkdir -p build

# Install npm packages we want to include to a local directory.
#
# To install in a subdirectory, npm requires this directory to exist.
node_modules:
	mkdir -p node_modules
	npm install uuid
