"""
Shared State Manager

Manages shared state for multi-agent coordination using Redis or Neo4j.
"""

import logging
from typing import Dict, Any, Optional
import json

logger = logging.getLogger(__name__)


class SharedStateManager:
    """Manages shared state for multi-agent coordination."""
    
    def __init__(self, redis_client=None, neo4j_manager=None):
        """
        Initialize shared state manager.
        
        Args:
            redis_client: Redis client (optional)
            neo4j_manager: Neo4j manager (optional, fallback)
        """
        self.redis_client = redis_client
        self.neo4j_manager = neo4j_manager
        self._use_redis = redis_client is not None
    
    async def set_state(self, key: str, value: Dict[str, Any], ttl: int = None):
        """Set shared state."""
        try:
            if self._use_redis:
                import redis.asyncio as redis
                await self.redis_client.set(key, json.dumps(value), ex=ttl)
            else:
                # Fallback to in-memory (for development)
                if not hasattr(self, '_memory_state'):
                    self._memory_state = {}
                self._memory_state[key] = value
        except Exception as e:
            logger.error(f"Failed to set state: {e}")
    
    async def get_state(self, key: str) -> Optional[Dict[str, Any]]:
        """Get shared state."""
        try:
            if self._use_redis:
                value = await self.redis_client.get(key)
                if value:
                    return json.loads(value)
            else:
                if hasattr(self, '_memory_state'):
                    return self._memory_state.get(key)
            return None
        except Exception as e:
            logger.error(f"Failed to get state: {e}")
            return None
    
    async def update_state(self, key: str, updates: Dict[str, Any]):
        """Update shared state."""
        current = await self.get_state(key) or {}
        current.update(updates)
        await self.set_state(key, current)
