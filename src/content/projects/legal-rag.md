---
title: "Legal Knowledge Graph RAG System"
category: "Generative AI & NLP"
date: "2025-11"
techStack: ["Python", "Neo4j", "Graphiti", "Gemini", "Pydantic", "LangChain"]
description: "A RAG assistant for immigration case law that outperforms standard retrieval by 15–17% using a 264K-node knowledge graph."
summary: "Built a legal AI assistant that combines a Neo4j knowledge graph (264K nodes, 506K relationships) with Gemini 2.5 Flash to answer immigration case law questions. Pydantic-driven structured extraction turns raw court opinions into a typed graph, so the schema is fixed up front rather than inferred at parse time. It outperforms NaiveRAG and CBR-RAG by 15–17% on faithfulness, using a hybrid retrieval pipeline that blends vector search with Cypher-based multi-hop graph traversal."
featured: true
links: {}
---
