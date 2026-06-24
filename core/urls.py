from django.urls import path, include
from django.shortcuts import render, redirect
from rest_framework.routers import DefaultRouter
from . import views
from . import viewsets
from core import uiux_integration_views
from . import wizard_views

# ============================================================
# DRF Router — otomatis generate URL untuk semua ViewSet
# ============================================================
# Setiap router.register() menghasilkan:
#   GET    /api/v2/<prefix>/         → list
#   POST   /api/v2/<prefix>/         → create
#   GET    /api/v2/<prefix>/{pk}/    → retrieve
#   PUT    /api/v2/<prefix>/{pk}/    → update
#   PATCH  /api/v2/<prefix>/{pk}/    → partial_update
#   DELETE /api/v2/<prefix>/{pk}/    → destroy

router = DefaultRouter()
router.register(r'data-collection', viewsets.DataEntryViewSet,       basename='data-collection')
router.register(r'analysis',        viewsets.AnalysisViewSet,        basename='analysis')
router.register(r'models',          viewsets.AIModelViewSet,          basename='models')
router.register(r'visualization',   viewsets.VisualizationViewSet,    basename='visualization')
router.register(r'training',        viewsets.TrainingSessionViewSet,  basename='training')
router.register(r'automation',      viewsets.WorkflowViewSet,         basename='automation')
router.register(r'collaboration',   viewsets.CollaborationViewSet,    basename='collaboration')
router.register(r'insights',        viewsets.InsightViewSet,          basename='insights')
router.register(r'datasets',        viewsets.DatasetViewSet,          basename='datasets')
router.register(r'api-keys',        viewsets.APIKeyViewSet,           basename='api-keys')
router.register(r'submissions',     viewsets.IntelligenceSubmissionViewSet, basename='submissions')

urlpatterns = [
    # ============================================================
    # PAGES (HTML render)
    # ============================================================
    path('',                  views.landing_page,   name='landing'),

    path('login.html',        views.login_page,     name='login'),
    path('login',             views.login_page,     name='login_alias'),

    path('register.html',     views.register_page,  name='register'),
    path('register',          views.register_page,  name='register_alias'),

    path('dashboard.html',    views.dashboard_page, name='dashboard'),
    path('dashboard',         views.dashboard_page, name='dashboard_alias'),

    path('issue/<int:issue_id>/detail/', uiux_integration_views.issue_full_detail_page, name='issue_full_detail'),

    path('data-entry/',       views.data_entry_page, name='data_entry'),
    path('data-entry',        views.data_entry_page, name='data_entry_alias'),
    path('data-entry.html',   views.data_entry_page, name='data_entry_html'),
    path('data-entry/proses/<int:submission_id>/', views.data_entry_proses_page, name='data_entry_proses'),

    path(
        'training.html',
        lambda request: render(request, 'training.html')
        if request.user.is_authenticated else redirect('/creation/login.html'),
        name='training'
    ),

    # ============================================================
    # AUTH API (tetap pakai function-based views)
    # ============================================================
    path('api/auth/register',  views.api_register,  name='api_register'),
    path('api/auth/login',     views.api_login,      name='api_login'),
    path('api/auth/logout',    views.api_logout,     name='api_logout'),
    path('api/auth/me',        views.api_me,         name='api_me'),

    # ============================================================
    # FLUTTER / DATA ENTRY API (legacy — ambil semua DataEntry)
    # ============================================================
    path('api/data-entry/',    views.ambil_data_entry, name='api_data_entry'),

    # ============================================================
    # ML API (tetap function-based — logika ML kompleks)
    # ============================================================
    path('api/training/start', views.start_training,   name='start_training'),
    path('api/predict',        views.predict,           name='predict'),
    path('api/stats',          views.api_stats,         name='api_stats'),
    path('api/ml/framing',     views.api_ml_framing,   name='api_ml_framing'),

    # ============================================================
    # SUBMISSION API (legacy endpoint untuk Engineer kirim file)
    # ============================================================
    path('api/submissions/receive/',
         views.api_submission_receive,
         name='api_submission_receive'),
    path('api/submissions/<int:submission_id>/status/',
         views.api_submission_status,
         name='api_submission_status'),
    path('api/submissions/list/',
         views.api_submissions_list,
         name='api_submissions_list'),
    path('api/submissions/<int:submission_id>/stage/',
         views.api_submission_stage_update,
         name='api_submission_stage_update'),

    # ============================================================
    # DRF ROUTER — semua CRUD endpoint v2
    # Contoh: GET /api/v2/data-collection/
    #         POST /api/v2/datasets/
    #         DELETE /api/v2/models/5/
    # ============================================================
    path('api/v2/', include(router.urls)),

    # DRF browsable API root (opsional, bisa dihapus di production)
    path('api/v2/auth/', include('rest_framework.urls', namespace='rest_framework')),
]

urlpatterns += [
    path('api/ic_projects/', uiux_integration_views.api_get_projects, name='api_get_projects'),
    path('api/projects/<int:project_id>/issues', uiux_integration_views.api_get_issues, name='api_get_issues'),
    path('api/intring_status/', uiux_integration_views.api_intring_status, name='api_intring_status'),
]

# Structured Data Wizard API Endpoints
urlpatterns += [
    path('api/dataset/fetch', wizard_views.api_dataset_fetch, name='api_dataset_fetch'),
    path('api/dataset/upload', wizard_views.api_dataset_upload, name='api_dataset_upload'),
    path('api/process', wizard_views.api_process, name='api_process'),
    path('api/train', wizard_views.api_train, name='api_train'),
    path('api/train/status/<str:job_id>', wizard_views.api_train_status, name='api_train_status'),
    path('api/train/result/<str:job_id>', wizard_views.api_train_result, name='api_train_result'),
    path('api/train/download/<str:job_id>', wizard_views.api_model_download, name='api_train_download'),
    path('api/model/download/<str:job_id>', wizard_views.api_model_download, name='api_model_download'),
    path('api/draft/save', wizard_views.api_draft_save, name='api_draft_save'),
    path('api/draft/load/<str:submission_id>', wizard_views.api_draft_load, name='api_draft_load'),
    path('api/dataset/load-submission/<int:submission_id>', wizard_views.api_dataset_load_submission, name='api_dataset_load_submission'),
    path('api/dataset/download-processed/<str:dataset_id>', wizard_views.api_download_processed, name='api_dataset_download_processed'),
    path('api/train/pdf-report/<str:job_id>', wizard_views.api_pdf_report, name='api_pdf_report'),
]

