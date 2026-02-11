"""
Vector Memory Store

Stores and retrieves memories using vector embeddings for semantic search.
Uses ChromaDB as the vector database.
"""

import logging
import os
from typing import List, Optional, Dict, Any
from pathlib import Path

from .schema import MemoryEntry, ExploitMemory, FailureMemory

logger = logging.getLogger(__name__)

# Try to import ChromaDB, fallback to simple file-based storage if not available
try:
    import chromadb
    from chromadb.config import Settings
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    logger.warning("ChromaDB not available, using file-based memory storage")

# Try to import OpenAI embeddings
try:
    from langchain_openai import OpenAIEmbeddings
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    logger.warning("OpenAI embeddings not available")


class VectorMemoryStore:
    """Vector-based memory store for persistent learning."""
    
    def __init__(self, persist_directory: Optional[str] = None, user_id: str = None, project_id: str = None):
        """
        Initialize vector memory store.
        
        Args:
            persist_directory: Directory to persist ChromaDB data
            user_id: User ID for filtering memories
            project_id: Project ID for filtering memories
        """
        self.user_id = user_id
        self.project_id = project_id
        
        if persist_directory is None:
            persist_directory = os.getenv("CHROMADB_PERSIST_DIR", "./chroma_db")
        
        self.persist_directory = Path(persist_directory)
        self.persist_directory.mkdir(parents=True, exist_ok=True)
        
        # Initialize embeddings
        if EMBEDDINGS_AVAILABLE:
            openai_api_key = os.getenv("OPENAI_API_KEY")
            if openai_api_key:
                self.embeddings = OpenAIEmbeddings(
                    model="text-embedding-3-small",
                    openai_api_key=openai_api_key
                )
            else:
                self.embeddings = None
                logger.warning("OPENAI_API_KEY not set, embeddings disabled")
        else:
            self.embeddings = None
        
        # Initialize ChromaDB if available
        if CHROMADB_AVAILABLE and self.embeddings:
            try:
                self.client = chromadb.PersistentClient(
                    path=str(self.persist_directory),
                    settings=Settings(anonymized_telemetry=False)
                )
                self.collection = self.client.get_or_create_collection(
                    name="exploit_memories",
                    metadata={"description": "Exploit success and failure memories"}
                )
                self._use_chromadb = True
                logger.info(f"ChromaDB initialized at {self.persist_directory}")
            except Exception as e:
                logger.error(f"Failed to initialize ChromaDB: {e}")
                self._use_chromadb = False
        else:
            self._use_chromadb = False
            logger.info("Using file-based memory storage (ChromaDB or embeddings not available)")
    
    async def store_exploit_success(self, memory: ExploitMemory) -> str:
        """
        Store a successful exploit memory.
        
        Args:
            memory: ExploitMemory instance
            
        Returns:
            Memory ID
        """
        if not self._use_chromadb:
            logger.warning("ChromaDB not available, memory not stored")
            return memory.memory_id
        
        try:
            # Generate embedding text
            embedding_text = memory.to_embedding_text()
            
            # Generate embedding
            embedding = await self.embeddings.aembed_query(embedding_text)
            
            # Store in ChromaDB
            self.collection.add(
                ids=[memory.memory_id],
                embeddings=[embedding],
                documents=[embedding_text],
                metadatas=[{
                    "memory_type": "exploit_success",
                    "user_id": memory.user_id,
                    "project_id": memory.project_id,
                    "cve_id": memory.cve_id or "",
                    "target_service": memory.target_service or "",
                    "metasploit_module": memory.metasploit_module or "",
                    "session_opened": str(memory.session_opened),
                    **memory.metadata
                }]
            )
            
            logger.info(f"Stored exploit success memory: {memory.memory_id}")
            return memory.memory_id
            
        except Exception as e:
            logger.error(f"Failed to store exploit success: {e}")
            return memory.memory_id
    
    async def store_exploit_failure(self, memory: FailureMemory) -> str:
        """
        Store a failed exploit memory.
        
        Args:
            memory: FailureMemory instance
            
        Returns:
            Memory ID
        """
        if not self._use_chromadb:
            logger.warning("ChromaDB not available, memory not stored")
            return memory.memory_id
        
        try:
            # Generate embedding text
            embedding_text = memory.to_embedding_text()
            
            # Generate embedding
            embedding = await self.embeddings.aembed_query(embedding_text)
            
            # Store in ChromaDB
            self.collection.add(
                ids=[memory.memory_id],
                embeddings=[embedding],
                documents=[embedding_text],
                metadatas=[{
                    "memory_type": "exploit_failure",
                    "user_id": memory.user_id,
                    "project_id": memory.project_id,
                    "cve_id": memory.cve_id or "",
                    "target_service": memory.target_service or "",
                    "failure_reason": memory.failure_reason,
                    **memory.metadata
                }]
            )
            
            logger.info(f"Stored exploit failure memory: {memory.memory_id}")
            return memory.memory_id
            
        except Exception as e:
            logger.error(f"Failed to store exploit failure: {e}")
            return memory.memory_id
    
    async def retrieve_similar_memories(
        self,
        query: str,
        memory_type: Optional[str] = None,
        limit: int = 5,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve similar memories using semantic search.
        
        Args:
            query: Search query
            memory_type: Filter by memory type (exploit_success, exploit_failure)
            limit: Maximum number of results
            user_id: Filter by user ID (uses instance user_id if None)
            project_id: Filter by project ID (uses instance project_id if None)
            
        Returns:
            List of memory dictionaries
        """
        if not self._use_chromadb:
            logger.warning("ChromaDB not available, returning empty results")
            return []
        
        try:
            # Generate query embedding
            query_embedding = await self.embeddings.aembed_query(query)
            
            # Build where clause for filtering
            where_clause = {}
            if memory_type:
                where_clause["memory_type"] = memory_type
            if user_id or self.user_id:
                where_clause["user_id"] = user_id or self.user_id
            if project_id or self.project_id:
                where_clause["project_id"] = project_id or self.project_id
            
            # Query ChromaDB
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=limit,
                where=where_clause if where_clause else None
            )
            
            # Format results
            memories = []
            if results["ids"] and len(results["ids"][0]) > 0:
                for i, memory_id in enumerate(results["ids"][0]):
                    memories.append({
                        "memory_id": memory_id,
                        "document": results["documents"][0][i],
                        "metadata": results["metadatas"][0][i],
                        "distance": results["distances"][0][i] if "distances" in results else None
                    })
            
            logger.info(f"Retrieved {len(memories)} similar memories for query: {query[:50]}")
            return memories
            
        except Exception as e:
            logger.error(f"Failed to retrieve memories: {e}")
            return []
    
    async def retrieve_by_cve(self, cve_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Retrieve memories for a specific CVE.
        
        Args:
            cve_id: CVE identifier
            limit: Maximum number of results
            
        Returns:
            List of memory dictionaries
        """
        if not self._use_chromadb:
            return []
        
        try:
            results = self.collection.get(
                where={"cve_id": cve_id},
                limit=limit
            )
            
            memories = []
            if results["ids"]:
                for i, memory_id in enumerate(results["ids"]):
                    memories.append({
                        "memory_id": memory_id,
                        "document": results["documents"][i],
                        "metadata": results["metadatas"][i]
                    })
            
            return memories
            
        except Exception as e:
            logger.error(f"Failed to retrieve memories by CVE: {e}")
            return []
