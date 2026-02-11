"""Orchestrator helper functions.

This module contains helper functions extracted from the main orchestrator
to keep the architectural flow clear and maintainable.
"""

from .json_utils import (
    DateTimeEncoder,
    json_dumps_safe,
    extract_json,
)

from .parsing import (
    parse_llm_decision,
    try_parse_llm_decision,
    parse_analysis_response,
)

from .phase import (
    classify_attack_path,
    determine_phase_for_new_objective,
)

from .exploit_writer import (
    create_exploit_node,
    close_driver as close_exploit_writer_driver,
)

from .debug import (
    save_graph_image,
)

from .config import (
    set_checkpointer,
    get_checkpointer,
    get_thread_id,
    create_config,
    get_config_values,
    get_identifiers,
    is_session_config_complete,
)

from .planning import (
    parse_plan_response,
    validate_plan,
    mark_step_complete,
    mark_step_failed,
    get_next_pending_step,
    get_completed_steps,
    should_adapt_plan,
    format_plan_for_prompt,
)

from .context_management import (
    compress_execution_steps,
    score_step_importance,
    find_relevant_steps,
    mark_important_events,
    format_compressed_trace,
)

from .parallel_execution import (
    TaskDAG,
    TaskNode,
    ParallelExecutor,
    build_dag_from_plan,
    identify_parallelizable_tasks,
)

from .risk_assessment import (
    assess_risk,
    RiskAssessment,
    RiskFactors,
)

from .templates import (
    ExploitTemplate,
    TemplateLibrary,
)

__all__ = [
    # json_utils
    "DateTimeEncoder",
    "json_dumps_safe",
    "extract_json",
    # parsing
    "parse_llm_decision",
    "try_parse_llm_decision",
    "parse_analysis_response",
    # phase
    "classify_attack_path",
    "determine_phase_for_new_objective",
    # exploit_writer
    "create_exploit_node",
    "close_exploit_writer_driver",
    # debug
    "save_graph_image",
    # config
    "set_checkpointer",
    "get_checkpointer",
    "get_thread_id",
    "create_config",
    "get_config_values",
    "get_identifiers",
    "is_session_config_complete",
    # planning
    "parse_plan_response",
    "validate_plan",
    "mark_step_complete",
    "mark_step_failed",
    "get_next_pending_step",
    "get_completed_steps",
    "should_adapt_plan",
    "format_plan_for_prompt",
    # context_management
    "compress_execution_steps",
    "score_step_importance",
    "find_relevant_steps",
    "mark_important_events",
    "format_compressed_trace",
    # parallel_execution
    "TaskDAG",
    "TaskNode",
    "ParallelExecutor",
    "build_dag_from_plan",
    "identify_parallelizable_tasks",
    # risk_assessment
    "assess_risk",
    "RiskAssessment",
    "RiskFactors",
    # templates
    "ExploitTemplate",
    "TemplateLibrary",
]
