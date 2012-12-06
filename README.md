redis-reply-js-parser
=====================

yet another js parser for redis replies

We met some parsing bug on multi replies using the official javascript parser in node_redis. So I wrote this one to solve the issue.
The performance is very close to the official javascript parser from my local, testing with the multi_bench script in the node_redis module.
