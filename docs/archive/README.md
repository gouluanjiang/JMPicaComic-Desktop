# 历史文档索引

这里保存已完成阶段的计划、审查和验收记录，便于追溯，不构成当前需求或执行授权。当前功能及边界以[项目状态](../PROJECT_STATUS.md)、[当前交接](../DEVELOPMENT_HANDOFF.md)和最新用户决定为准。

## 完整交接快照

- [截至 2026-09-29 的完整交接](DEVELOPMENT_HANDOFF_2026-09-29.md)。
- [截至 2026-09-15 的早期交接](DEVELOPMENT_HANDOFF_ARCHIVE_2026-09-15.md)。

## 旧仓库事项结项

2026-09-29 的仓库整理依据已有实现与当前产品范围关闭以下旧事项：

| 事项 | 关闭结论 |
| --- | --- |
| [#3：可信作者范围凭据](https://github.com/gouluanjiang/MangaMonitor-AI/issues/3) | `completed`：相应工程实现已完成 |
| [#4：仅新增库存应用](https://github.com/gouluanjiang/MangaMonitor-AI/issues/4) | `completed`：相应工程实现已完成 |
| [#5：验证库存后完成任务](https://github.com/gouluanjiang/MangaMonitor-AI/issues/5) | `completed`：相应工程实现已完成 |
| [#2：旧生产验收整改跟踪](https://github.com/gouluanjiang/MangaMonitor-AI/issues/2) | `not_planned`：旧云端生产范围不再作为桌面 V1 待办 |
| [#6：长期运行生产验收](https://github.com/gouluanjiang/MangaMonitor-AI/issues/6) | `not_planned`：常驻云端生产方案不在当前范围 |
| [#7：本地状态发布至云端](https://github.com/gouluanjiang/MangaMonitor-AI/issues/7) | `not_planned`：已取消的云端状态回传方案 |
| [#9：旧长期生产路线图](https://github.com/gouluanjiang/MangaMonitor-AI/issues/9) | `not_planned`：由已交付的桌面范围替代 |

上述工程结项**不是云端生产验收通过**，也不启用云监控；`production_enabled=false` 保持不变。16 个过期远端分支已在完整备份和恢复检查后删除；当前 `main`、历史 PR 和发行标签仍可追溯。私有备份与核对明细不进入公开仓库。

12 个历史工作流已停用，Rust 基线、桌面前端和 Windows 桌面这 3 个正式 CI 保持启用。历史工作流源码和已有运行记录保留，维护旧契约时可按明确范围单独重新启用；这不表示删除实现或完成云端生产验收。

## 早期工程计划与结果

下列 53 份文档原先位于仓库根目录，现统一保留在 `early-engineering/`。其中代码和命令里的路径仍以仓库根目录为基准；Markdown 链接已按新位置调整。旧 `V1`、`production`、`pending` 等阶段称谓不代表当前桌面正式版的完成状态，也不会开启云监控或恢复取消功能。

`PREPRODUCTION_AUTHOR_SEARCH_ACCEPTANCE.md` 保留旧云端生产门禁的历史依据；归档不代表云端生产获准启用。现行执行约束继续见 [AGENTS.md](../../AGENTS.md)。来源基线及独立仓库隔离约束仍保留在根目录的 [SOURCE_BASELINE.md](../../SOURCE_BASELINE.md)。

- [AI_IDEA_V1.md](early-engineering/AI_IDEA_V1.md)
- [ASSISTANT_A1_RESULTS.md](early-engineering/ASSISTANT_A1_RESULTS.md)
- [ASSISTANT_A2.md](early-engineering/ASSISTANT_A2.md)
- [ASSISTANT_A2_RESULTS.md](early-engineering/ASSISTANT_A2_RESULTS.md)
- [ASSISTANT_A3.md](early-engineering/ASSISTANT_A3.md)
- [ASSISTANT_A3_RESULTS.md](early-engineering/ASSISTANT_A3_RESULTS.md)
- [ASSISTANT_A4.md](early-engineering/ASSISTANT_A4.md)
- [ASSISTANT_A4_RESULTS.md](early-engineering/ASSISTANT_A4_RESULTS.md)
- [ASSISTANT_A5.md](early-engineering/ASSISTANT_A5.md)
- [ASSISTANT_A5_RESULTS.md](early-engineering/ASSISTANT_A5_RESULTS.md)
- [ASSISTANT_A6.md](early-engineering/ASSISTANT_A6.md)
- [ASSISTANT_A6_10.md](early-engineering/ASSISTANT_A6_10.md)
- [ASSISTANT_A6_10_RESULTS.md](early-engineering/ASSISTANT_A6_10_RESULTS.md)
- [ASSISTANT_A6_11.md](early-engineering/ASSISTANT_A6_11.md)
- [ASSISTANT_A6_11_RESULTS.md](early-engineering/ASSISTANT_A6_11_RESULTS.md)
- [ASSISTANT_A6_12.md](early-engineering/ASSISTANT_A6_12.md)
- [ASSISTANT_A6_12_RESULTS.md](early-engineering/ASSISTANT_A6_12_RESULTS.md)
- [ASSISTANT_A6_13_RESULTS.md](early-engineering/ASSISTANT_A6_13_RESULTS.md)
- [ASSISTANT_A6_14A_RESULTS.md](early-engineering/ASSISTANT_A6_14A_RESULTS.md)
- [ASSISTANT_A6_14B_RESULTS.md](early-engineering/ASSISTANT_A6_14B_RESULTS.md)
- [ASSISTANT_A6_15_RESULTS.md](early-engineering/ASSISTANT_A6_15_RESULTS.md)
- [ASSISTANT_A6_2_RESULTS.md](early-engineering/ASSISTANT_A6_2_RESULTS.md)
- [ASSISTANT_A6_3_RESULTS.md](early-engineering/ASSISTANT_A6_3_RESULTS.md)
- [ASSISTANT_A6_4_RESULTS.md](early-engineering/ASSISTANT_A6_4_RESULTS.md)
- [ASSISTANT_A6_5_RESULTS.md](early-engineering/ASSISTANT_A6_5_RESULTS.md)
- [ASSISTANT_A6_5_UPSTREAM_AUDIT.md](early-engineering/ASSISTANT_A6_5_UPSTREAM_AUDIT.md)
- [ASSISTANT_A6_6_RESULTS.md](early-engineering/ASSISTANT_A6_6_RESULTS.md)
- [ASSISTANT_A6_7.md](early-engineering/ASSISTANT_A6_7.md)
- [ASSISTANT_A6_7_RESULTS.md](early-engineering/ASSISTANT_A6_7_RESULTS.md)
- [ASSISTANT_A6_8.md](early-engineering/ASSISTANT_A6_8.md)
- [ASSISTANT_A6_8_RESULTS.md](early-engineering/ASSISTANT_A6_8_RESULTS.md)
- [ASSISTANT_A6_9.md](early-engineering/ASSISTANT_A6_9.md)
- [ASSISTANT_A6_9_RESULTS.md](early-engineering/ASSISTANT_A6_9_RESULTS.md)
- [ASSISTANT_DATA_CONTRACT_V1.md](early-engineering/ASSISTANT_DATA_CONTRACT_V1.md)
- [ASSISTANT_PHASE3B_SINGLE_AUTHOR_CONCURRENCY_RESULTS.md](early-engineering/ASSISTANT_PHASE3B_SINGLE_AUTHOR_CONCURRENCY_RESULTS.md)
- [ASSISTANT_V1_1_1_RESULTS.md](early-engineering/ASSISTANT_V1_1_1_RESULTS.md)
- [ASSISTANT_V1_1_RESULTS.md](early-engineering/ASSISTANT_V1_1_RESULTS.md)
- [ASSISTANT_V1_2_RESULTS.md](early-engineering/ASSISTANT_V1_2_RESULTS.md)
- [ASSISTANT_V1_3_RESULTS.md](early-engineering/ASSISTANT_V1_3_RESULTS.md)
- [ASSISTANT_V1_4_RESULTS.md](early-engineering/ASSISTANT_V1_4_RESULTS.md)
- [ASSISTANT_V1_5_RESULTS.md](early-engineering/ASSISTANT_V1_5_RESULTS.md)
- [ASSISTANT_V1_6_RESULTS.md](early-engineering/ASSISTANT_V1_6_RESULTS.md)
- [MATCHER_M1.md](early-engineering/MATCHER_M1.md)
- [MATCHER_M2.md](early-engineering/MATCHER_M2.md)
- [MATCHER_M2_RESULTS.md](early-engineering/MATCHER_M2_RESULTS.md)
- [MATCHER_M3.md](early-engineering/MATCHER_M3.md)
- [MATCHER_M3_RESULTS.md](early-engineering/MATCHER_M3_RESULTS.md)
- [PHASE1A_RESULTS.md](early-engineering/PHASE1A_RESULTS.md)
- [PHASE3A.md](early-engineering/PHASE3A.md)
- [PHASE3A_RESULTS.md](early-engineering/PHASE3A_RESULTS.md)
- [PHASE3B_RESULTS.md](early-engineering/PHASE3B_RESULTS.md)
- [PREPRODUCTION_AUTHOR_SEARCH_ACCEPTANCE.md](early-engineering/PREPRODUCTION_AUTHOR_SEARCH_ACCEPTANCE.md)
- [README-CLOUD-HISTORY.md](early-engineering/README-CLOUD-HISTORY.md)

## 桌面版开发记录（2026-09 至 2026-10）

下列 93 份文档原先平铺在 `docs/` 下，2026-11-19 统一移到 `desktop-development/`：各功能批次的设计、实现报告、修复记录、审查和阶段路线图。仓库内的 Markdown 链接已按新位置调整；仍在生效的下载执行审查、JM 性能结论、交接、使用指南、项目状态和全部版本说明／发行记录留在 `docs/` 根目录。报告里的“当前”“待验收”“冻结”等阶段描述不覆盖现行状态。

- [AUTHOR_ATTRIBUTION_FIX_2026-09-15.md](desktop-development/AUTHOR_ATTRIBUTION_FIX_2026-09-15.md)
- [AUTHOR_CATALOG_COVERAGE_2026-09-29.md](desktop-development/AUTHOR_CATALOG_COVERAGE_2026-09-29.md)
- [AUTHOR_CATALOG_SCALE_2026-09-20.md](desktop-development/AUTHOR_CATALOG_SCALE_2026-09-20.md)
- [AUTHOR_COMPLETENESS_BATCH_2026-09-12.md](desktop-development/AUTHOR_COMPLETENESS_BATCH_2026-09-12.md)
- [AUTHOR_INCREMENTAL_CHECKS_2026-09-19.md](desktop-development/AUTHOR_INCREMENTAL_CHECKS_2026-09-19.md)
- [AUTHOR_PROGRESS_REFRESH_FIX_2026-09-20.md](desktop-development/AUTHOR_PROGRESS_REFRESH_FIX_2026-09-20.md)
- [AUTHOR_QUERY_GUARD_FIX_2026-09-19.md](desktop-development/AUTHOR_QUERY_GUARD_FIX_2026-09-19.md)
- [AUTHOR_QUERY_POLICIES_2026-09-22.md](desktop-development/AUTHOR_QUERY_POLICIES_2026-09-22.md)
- [AUTHOR_SAMPLE_AUDIT_2026-09-14.md](desktop-development/AUTHOR_SAMPLE_AUDIT_2026-09-14.md)
- [AUTHOR_WORKSPACE_2026-10-01.md](desktop-development/AUTHOR_WORKSPACE_2026-10-01.md)
- [BATCH_QUEUE_AND_MATCHING_2026-09-12.md](desktop-development/BATCH_QUEUE_AND_MATCHING_2026-09-12.md)
- [BROWSING_DOWNLOAD_EXPERIENCE_2026-09-29.md](desktop-development/BROWSING_DOWNLOAD_EXPERIENCE_2026-09-29.md)
- [BUILT_IN_READER_2026-09-26.md](desktop-development/BUILT_IN_READER_2026-09-26.md)
- [CI_RUNTIME_MAINTENANCE_2026-10-07.md](desktop-development/CI_RUNTIME_MAINTENANCE_2026-10-07.md)
- [COVER_LOADING_2026-09-24.md](desktop-development/COVER_LOADING_2026-09-24.md)
- [COVER_LOADING_ROUND2_2026-09-24.md](desktop-development/COVER_LOADING_ROUND2_2026-09-24.md)
- [DISCOVERY_CHANGE_SUMMARY_2026-09-26.md](desktop-development/DISCOVERY_CHANGE_SUMMARY_2026-09-26.md)
- [DOWNLOAD_FILE_PRESENCE_2026-09-12.md](desktop-development/DOWNLOAD_FILE_PRESENCE_2026-09-12.md)
- [DOWNLOAD_METADATA_DIAGNOSTICS_2026-10-01.md](desktop-development/DOWNLOAD_METADATA_DIAGNOSTICS_2026-10-01.md)
- [DOWNLOAD_QUEUE_PRESENTATION_2026-09-26.md](desktop-development/DOWNLOAD_QUEUE_PRESENTATION_2026-09-26.md)
- [DOWNLOAD_RESCAN_FINALIZATION_FIX_2026-09-18.md](desktop-development/DOWNLOAD_RESCAN_FINALIZATION_FIX_2026-09-18.md)
- [FULL_SELECTION_BATCH_2026-09-14.md](desktop-development/FULL_SELECTION_BATCH_2026-09-14.md)
- [JM_DESKTOP_DOWNLOAD_GATE_2026-09-10.md](desktop-development/JM_DESKTOP_DOWNLOAD_GATE_2026-09-10.md)
- [JM_JPEG_PERFORMANCE_2026-09-12.md](desktop-development/JM_JPEG_PERFORMANCE_2026-09-12.md)
- [JM_MISSING_LISTING_METADATA_2026-09-20.md](desktop-development/JM_MISSING_LISTING_METADATA_2026-09-20.md)
- [JM_SEARCH_BOUNDARY_2026-09-29.md](desktop-development/JM_SEARCH_BOUNDARY_2026-09-29.md)
- [JM_SEARCH_KANA_COMPARISON_2026-09-14.md](desktop-development/JM_SEARCH_KANA_COMPARISON_2026-09-14.md)
- [JM_SINGLE_DOWNLOAD_BATCH_2026-09-11.md](desktop-development/JM_SINGLE_DOWNLOAD_BATCH_2026-09-11.md)
- [JM_WEEKLY_FIX_2026-09-14.md](desktop-development/JM_WEEKLY_FIX_2026-09-14.md)
- [LIBRARY_BROWSING_FOLLOWUPS_2026-10-01.md](desktop-development/LIBRARY_BROWSING_FOLLOWUPS_2026-10-01.md)
- [LIBRARY_USABILITY_2026-09-13.md](desktop-development/LIBRARY_USABILITY_2026-09-13.md)
- [LIBRARY_ZIP_BATCH_2026-09-13.md](desktop-development/LIBRARY_ZIP_BATCH_2026-09-13.md)
- [LIBRARY_ZIP_EXCEPTION_RESOLUTION_2026-09-13.md](desktop-development/LIBRARY_ZIP_EXCEPTION_RESOLUTION_2026-09-13.md)
- [LIBRARY_ZIP_SAMPLES_BATCH_2026-09-13.md](desktop-development/LIBRARY_ZIP_SAMPLES_BATCH_2026-09-13.md)
- [LISTING_ITEM_ISOLATION_2026-09-22.md](desktop-development/LISTING_ITEM_ISOLATION_2026-09-22.md)
- [LOCAL_STORE_CONTENTION_2026-09-22.md](desktop-development/LOCAL_STORE_CONTENTION_2026-09-22.md)
- [LOCAL_WORKBENCH_ACCEPTANCE_2026-09-09.md](desktop-development/LOCAL_WORKBENCH_ACCEPTANCE_2026-09-09.md)
- [LOCAL_WORKBENCH_BATCH2_2026-09-09.md](desktop-development/LOCAL_WORKBENCH_BATCH2_2026-09-09.md)
- [LOCAL_WORKBENCH_BATCH3_2026-09-09.md](desktop-development/LOCAL_WORKBENCH_BATCH3_2026-09-09.md)
- [LOCAL_WORKBENCH_COVER_SESSION_2026-09-09.md](desktop-development/LOCAL_WORKBENCH_COVER_SESSION_2026-09-09.md)
- [LOCAL_WORKBENCH_DETAIL_DESIGN.md](desktop-development/LOCAL_WORKBENCH_DETAIL_DESIGN.md)
- [LOCAL_WORKBENCH_DISCOVERY_DESIGN.md](desktop-development/LOCAL_WORKBENCH_DISCOVERY_DESIGN.md)
- [LOCAL_WORKBENCH_DUAL_LIBRARY_2026-09-10.md](desktop-development/LOCAL_WORKBENCH_DUAL_LIBRARY_2026-09-10.md)
- [LOCAL_WORKBENCH_FAVORITES_DESIGN.md](desktop-development/LOCAL_WORKBENCH_FAVORITES_DESIGN.md)
- [LOCAL_WORKBENCH_FAVORITES_FIX_2026-09-09.md](desktop-development/LOCAL_WORKBENCH_FAVORITES_FIX_2026-09-09.md)
- [LOCAL_WORKBENCH_FEATURE_SCOPE.md](desktop-development/LOCAL_WORKBENCH_FEATURE_SCOPE.md)
- [LOCAL_WORKBENCH_FOLLOWING_SETTINGS_DESIGN.md](desktop-development/LOCAL_WORKBENCH_FOLLOWING_SETTINGS_DESIGN.md)
- [LOCAL_WORKBENCH_IMPLEMENTATION_2026-09-09.md](desktop-development/LOCAL_WORKBENCH_IMPLEMENTATION_2026-09-09.md)
- [LOCAL_WORKBENCH_JM_METADATA_FIX_2026-09-09.md](desktop-development/LOCAL_WORKBENCH_JM_METADATA_FIX_2026-09-09.md)
- [LOCAL_WORKBENCH_PICA_CONTINUITY_FIX_2026-09-09.md](desktop-development/LOCAL_WORKBENCH_PICA_CONTINUITY_FIX_2026-09-09.md)
- [LOCAL_WORKBENCH_PICA_FULL_READ_2026-09-09.md](desktop-development/LOCAL_WORKBENCH_PICA_FULL_READ_2026-09-09.md)
- [LOCAL_WORKBENCH_QUEUE_DESIGN.md](desktop-development/LOCAL_WORKBENCH_QUEUE_DESIGN.md)
- [LOCAL_WORKBENCH_UI_STRUCTURE.md](desktop-development/LOCAL_WORKBENCH_UI_STRUCTURE.md)
- [LOCAL_WORKBENCH_V1_DESIGN.md](desktop-development/LOCAL_WORKBENCH_V1_DESIGN.md)
- [LONG_REGRESSION_2026-10-02.md](desktop-development/LONG_REGRESSION_2026-10-02.md)
- [MAINTENANCE_AUDIT_2026-09-30.md](desktop-development/MAINTENANCE_AUDIT_2026-09-30.md)
- [NIGHT_MAINTENANCE_2026-10-01.md](desktop-development/NIGHT_MAINTENANCE_2026-10-01.md)
- [PC_ZIP_LIBRARY_BATCH_2026-09-13.md](desktop-development/PC_ZIP_LIBRARY_BATCH_2026-09-13.md)
- [PHASE3B_STATE_BOOTSTRAP.md](desktop-development/PHASE3B_STATE_BOOTSTRAP.md)
- [PICA_DOWNLOAD_REDIRECT_FIX_2026-09-12.md](desktop-development/PICA_DOWNLOAD_REDIRECT_FIX_2026-09-12.md)
- [PICA_MEDIA_FORMAT_FIX_2026-09-18.md](desktop-development/PICA_MEDIA_FORMAT_FIX_2026-09-18.md)
- [PICA_SINGLE_DOWNLOAD_BATCH_2026-09-12.md](desktop-development/PICA_SINGLE_DOWNLOAD_BATCH_2026-09-12.md)
- [PROJECT_REVIEW_2026-09-27.md](desktop-development/PROJECT_REVIEW_2026-09-27.md)
- [PROJECT_REVIEW_FIXES_2026-09-27.md](desktop-development/PROJECT_REVIEW_FIXES_2026-09-27.md)
- [READER_WINDOWS_2026-09-27.md](desktop-development/READER_WINDOWS_2026-09-27.md)
- [REVIEWED_OLD_LIBRARY_2026-09-18.md](desktop-development/REVIEWED_OLD_LIBRARY_2026-09-18.md)
- [REVIEWED_WORK_CREDITS_2026-09-22.md](desktop-development/REVIEWED_WORK_CREDITS_2026-09-22.md)
- [ROADMAP_AFTER_AUTHOR_COMPLETENESS_2026-09-12.md](desktop-development/ROADMAP_AFTER_AUTHOR_COMPLETENESS_2026-09-12.md)
- [ROADMAP_AFTER_BATCH_QUEUE_2026-09-12.md](desktop-development/ROADMAP_AFTER_BATCH_QUEUE_2026-09-12.md)
- [ROADMAP_AFTER_DUAL_LIBRARY_2026-09-10.md](desktop-development/ROADMAP_AFTER_DUAL_LIBRARY_2026-09-10.md)
- [ROADMAP_AFTER_JM_DOWNLOAD_2026-09-11.md](desktop-development/ROADMAP_AFTER_JM_DOWNLOAD_2026-09-11.md)
- [ROADMAP_AFTER_PICA_DOWNLOAD_2026-09-12.md](desktop-development/ROADMAP_AFTER_PICA_DOWNLOAD_2026-09-12.md)
- [ROADMAP_ZIP_LIBRARY_V1_2026-09-13.md](desktop-development/ROADMAP_ZIP_LIBRARY_V1_2026-09-13.md)
- [SCOPE_AUDIT_AND_V1_FREEZE_2026-09-13.md](desktop-development/SCOPE_AUDIT_AND_V1_FREEZE_2026-09-13.md)
- [SESSION_RESTORE_2026-09-27.md](desktop-development/SESSION_RESTORE_2026-09-27.md)
- [SOURCE_AUTHOR_ENTRY_FIX_2026-09-17.md](desktop-development/SOURCE_AUTHOR_ENTRY_FIX_2026-09-17.md)
- [SOURCE_LANGUAGE_BADGES_2026-09-26.md](desktop-development/SOURCE_LANGUAGE_BADGES_2026-09-26.md)
- [STABILITY_REVIEW_2026-10-07.md](desktop-development/STABILITY_REVIEW_2026-10-07.md)
- [TECHNICAL_AUDIT_REMEDIATION_20260908.md](desktop-development/TECHNICAL_AUDIT_REMEDIATION_20260908.md)
- [UI_INTEGRATION_2026-09-27.md](desktop-development/UI_INTEGRATION_2026-09-27.md)
- [UI_SETTINGS_BATCH_2026-09-14.md](desktop-development/UI_SETTINGS_BATCH_2026-09-14.md)
- [UPSTREAM_DIRECTORY_COMPATIBILITY_2026-09-10.md](desktop-development/UPSTREAM_DIRECTORY_COMPATIBILITY_2026-09-10.md)
- [V1_ACCEPTANCE_2026-09-15.md](desktop-development/V1_ACCEPTANCE_2026-09-15.md)
- [V1_ADD_ONLY_DOWNLOAD_THAW_2026-09-08.md](desktop-development/V1_ADD_ONLY_DOWNLOAD_THAW_2026-09-08.md)
- [V1_ADD_ONLY_STAGING_ACCEPTANCE.md](desktop-development/V1_ADD_ONLY_STAGING_ACCEPTANCE.md)
- [V1_INTEGRATION_BATCH_2026-09-15.md](desktop-development/V1_INTEGRATION_BATCH_2026-09-15.md)
- [V1_LIVE_ACCEPTANCE_2026-09-15.md](desktop-development/V1_LIVE_ACCEPTANCE_2026-09-15.md)
- [V1_MANUAL_WORKFLOW_2026-09-14.md](desktop-development/V1_MANUAL_WORKFLOW_2026-09-14.md)
- [V1_READINESS_2026-09-17.md](desktop-development/V1_READINESS_2026-09-17.md)
- [V1_SCOPE_MANUAL_UPDATES_2026-09-14.md](desktop-development/V1_SCOPE_MANUAL_UPDATES_2026-09-14.md)
- [WEBSITE_RECENT_UPDATES_2026-09-26.md](desktop-development/WEBSITE_RECENT_UPDATES_2026-09-26.md)
- [WINDOWS_LOCAL_VALIDATION_FOLLOWUP_2026-10-02.md](desktop-development/WINDOWS_LOCAL_VALIDATION_FOLLOWUP_2026-10-02.md)
- [WORK_DATES_AND_SORTING_2026-09-20.md](desktop-development/WORK_DATES_AND_SORTING_2026-09-20.md)
