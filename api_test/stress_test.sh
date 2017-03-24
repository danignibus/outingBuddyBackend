#!/bin/bash
echo "Running stress test."
query="?duration=6"
url="http://localhost:9090/api/outing"
printf "**************STRESS TEST RUN:***************\n\n" >> outingOutput.txt

for i in `seq 1 10`;
do
	content=$(time curl -H "Authorization: process.env.TEST_AUTH" "{$url}${query}")
	#content="$(curl -s "$url")"
	printf "$content\n\n" >> outingOutput.txt
done