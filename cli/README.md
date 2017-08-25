# Mashery CLI

A collection of command-line scripts to alleviate manual processing.

## Prerequisites

Node.js v6.11.1 or later

## Installation

Post clone of repository, perform the following steps:

* Change into the ```cli``` directory and run the command ```npm install```
* Copy/rename the file ```.env.sample``` to ```.env``` and update to reflect your Mashery area information and V3 API credentials.

## Usage

From within the cli directory, run following command to see usage instructions:

    node <script_file>.js -h

To run the application in debug mode, use following command:

    node <script_file>.js [options] | node_modules/bunyan/bin/bunyan
