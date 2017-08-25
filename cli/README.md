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

## The Tools

### Update Plan Description

This tools updates plan(s) description field with a listing of the APIs that are included in that plan. This tool was created in response to customer request to include the plan "manifest" in the application registration screen so that consumers can clearly see what APIs are included in the plan they are signing up for.

* When executed without any parameters, the tool will iterate through all packages and plans in the current area and update the description of any non-empty plan.
* When executed with the --package parameter only, the tool will iterate through all plans in the specified package and update the description of any non-empty plan.
* When executed with the --package and --plan parameters, the tool will update the specified (non-empty) plan.
