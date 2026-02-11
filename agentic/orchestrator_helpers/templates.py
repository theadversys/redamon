"""
Exploit Template Library

Pattern recognition and template matching for reusing successful exploit patterns.
"""

import logging
import json
from typing import List, Dict, Any, Optional
from pathlib import Path
from pydantic import BaseModel, Field
from datetime import datetime

logger = logging.getLogger(__name__)


class ExploitTemplate(BaseModel):
    """Template for a successful exploit pattern."""
    template_id: str = Field(description="Unique template identifier")
    name: str = Field(description="Template name")
    description: str = Field(description="What this template does")
    
    # Pattern matching criteria
    cve_id: Optional[str] = Field(default=None, description="CVE this template applies to")
    target_service: Optional[str] = Field(default=None, description="Target service/version")
    target_version_pattern: Optional[str] = Field(default=None, description="Version pattern (e.g., 'Apache 2.4.*')")
    
    # Template structure
    prerequisites: List[str] = Field(default_factory=list, description="What must be true before using this template")
    steps: List[Dict[str, Any]] = Field(default_factory=list, description="Template steps")
    expected_outputs: List[str] = Field(default_factory=list, description="Expected outputs at each step")
    success_criteria: List[str] = Field(default_factory=list, description="How to know it succeeded")
    
    # Execution details
    metasploit_module: Optional[str] = Field(default=None, description="Metasploit module to use")
    payload: Optional[str] = Field(default=None, description="Payload to use")
    exploit_args: Dict[str, Any] = Field(default_factory=dict, description="Default exploit arguments")
    
    # Template metadata
    success_count: int = Field(default=0, description="Number of successful uses")
    failure_count: int = Field(default=0, description="Number of failed uses")
    last_used: Optional[str] = Field(default=None, description="Last usage timestamp")
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    user_id: Optional[str] = Field(default=None)
    project_id: Optional[str] = Field(default=None)
    
    def success_rate(self) -> float:
        """Calculate success rate."""
        total = self.success_count + self.failure_count
        if total == 0:
            return 0.0
        return self.success_count / total
    
    def match_confidence(self, target_service: str = None, cve_id: str = None, target_version: str = None) -> float:
        """
        Calculate match confidence for a target (0.0 to 1.0).
        
        Args:
            target_service: Target service name
            cve_id: CVE identifier
            target_version: Target version
            
        Returns:
            Match confidence score
        """
        score = 0.0
        matches = 0
        total_criteria = 0
        
        # Match CVE
        if self.cve_id:
            total_criteria += 1
            if cve_id and self.cve_id == cve_id:
                score += 1.0
                matches += 1
        
        # Match service
        if self.target_service:
            total_criteria += 1
            if target_service and self.target_service.lower() in target_service.lower():
                score += 1.0
                matches += 1
        
        # Match version pattern (simplified)
        if self.target_version_pattern:
            total_criteria += 1
            if target_version and self._match_version_pattern(self.target_version_pattern, target_version):
                score += 1.0
                matches += 1
        
        if total_criteria == 0:
            return 0.5  # Default confidence if no criteria
        
        base_score = score / total_criteria
        
        # Boost score based on success rate
        success_rate_boost = self.success_rate() * 0.2
        
        return min(1.0, base_score + success_rate_boost)
    
    def _match_version_pattern(self, pattern: str, version: str) -> bool:
        """Simple version pattern matching."""
        # Replace * with .* for regex-like matching
        import re
        pattern_regex = pattern.replace("*", ".*")
        try:
            return bool(re.match(pattern_regex, version))
        except:
            return False


class TemplateLibrary:
    """Manages exploit templates."""
    
    def __init__(self, storage_path: Optional[str] = None):
        """
        Initialize template library.
        
        Args:
            storage_path: Path to store templates (default: ./templates)
        """
        if storage_path is None:
            storage_path = "./templates"
        
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.templates: Dict[str, ExploitTemplate] = {}
        
        # Load existing templates
        self._load_templates()
    
    def _load_templates(self):
        """Load templates from storage."""
        template_file = self.storage_path / "templates.json"
        if template_file.exists():
            try:
                with open(template_file, 'r') as f:
                    data = json.load(f)
                    for template_data in data.get("templates", []):
                        template = ExploitTemplate(**template_data)
                        self.templates[template.template_id] = template
                logger.info(f"Loaded {len(self.templates)} templates from {template_file}")
            except Exception as e:
                logger.error(f"Failed to load templates: {e}")
    
    def _save_templates(self):
        """Save templates to storage."""
        template_file = self.storage_path / "templates.json"
        try:
            data = {
                "templates": [t.model_dump() for t in self.templates.values()]
            }
            with open(template_file, 'w') as f:
                json.dump(data, f, indent=2)
            logger.info(f"Saved {len(self.templates)} templates to {template_file}")
        except Exception as e:
            logger.error(f"Failed to save templates: {e}")
    
    def add_template(self, template: ExploitTemplate) -> str:
        """Add a template to the library."""
        self.templates[template.template_id] = template
        self._save_templates()
        logger.info(f"Added template: {template.template_id} - {template.name}")
        return template.template_id
    
    def find_matching_templates(
        self,
        target_service: str = None,
        cve_id: str = None,
        target_version: str = None,
        min_confidence: float = 0.8
    ) -> List[ExploitTemplate]:
        """
        Find templates matching a target.
        
        Args:
            target_service: Target service name
            cve_id: CVE identifier
            target_version: Target version
            min_confidence: Minimum confidence threshold
            
        Returns:
            List of matching templates, sorted by confidence
        """
        matches = []
        
        for template in self.templates.values():
            confidence = template.match_confidence(target_service, cve_id, target_version)
            if confidence >= min_confidence:
                matches.append((confidence, template))
        
        # Sort by confidence (descending)
        matches.sort(key=lambda x: x[0], reverse=True)
        
        return [template for _, template in matches]
    
    def record_success(self, template_id: str):
        """Record a successful use of a template."""
        if template_id in self.templates:
            self.templates[template_id].success_count += 1
            self.templates[template_id].last_used = datetime.now().isoformat()
            self._save_templates()
    
    def record_failure(self, template_id: str):
        """Record a failed use of a template."""
        if template_id in self.templates:
            self.templates[template_id].failure_count += 1
            self.templates[template_id].last_used = datetime.now().isoformat()
            self._save_templates()
    
    def extract_template_from_exploit(
        self,
        exploit_details: Dict[str, Any],
        template_name: str
    ) -> ExploitTemplate:
        """
        Extract a template from a successful exploit.
        
        Args:
            exploit_details: Details of successful exploit
            template_name: Name for the template
            
        Returns:
            ExploitTemplate instance
        """
        import uuid
        
        template = ExploitTemplate(
            template_id=str(uuid.uuid4()),
            name=template_name,
            description=f"Template extracted from successful exploit: {exploit_details.get('cve_id', 'unknown')}",
            cve_id=exploit_details.get("cve_id"),
            target_service=exploit_details.get("target_service"),
            metasploit_module=exploit_details.get("metasploit_module"),
            payload=exploit_details.get("payload"),
            exploit_args=exploit_details.get("exploit_args", {}),
            prerequisites=exploit_details.get("prerequisites", []),
            steps=exploit_details.get("execution_steps", []),
            success_criteria=exploit_details.get("success_criteria", ["Session opened"]),
            user_id=exploit_details.get("user_id"),
            project_id=exploit_details.get("project_id"),
            success_count=1  # Initial success
        )
        
        return template
