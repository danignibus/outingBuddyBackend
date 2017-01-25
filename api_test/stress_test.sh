#!/bin/bash
echo "Running stress test."
query="?duration=1"
url="http://localhost:9090/api/outing"
printf "**************STRESS TEST RUN:***************\n\n" >> outingOutput.txt

for i in `seq 1 10`;
do
	content=$(curl -H "Authorization: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1ODY0MjkyYjQwNDhmMjNkYTU4M2E3ZmYiLCJpYXQiOjE0ODI5NTkxNDczNjN9.5QLr1FSYQZXNgwxm9kJ_asjNmCJKq9zWTVxg_W--Hd8" "{$url}${query}")
	#content="$(curl -s "$url")"
	printf "$content\n\n" >> outingOutput.txt
done