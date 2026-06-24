"""
ViewSets untuk DRF Router.
Semua CRUD endpoint model dihandle di sini menggunakan ModelViewSet.
Endpoint khusus (auth, ML, submissions) tetap di views.py.
"""
import os
import json
import random
import traceback

from django.utils import timezone
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.authentication import SessionAuthentication

from .models import (
    User, DataEntry, Analysis, AIModel, Visualization,
    TrainingSession, Workflow, Collaboration, Insight,
    Dataset, APIKey, IntelligenceSubmission
)
from .serializers import (
    UserSerializer, DataEntrySerializer, AnalysisSerializer,
    AIModelSerializer, VisualizationSerializer, TrainingSessionSerializer,
    WorkflowSerializer, CollaborationSerializer, InsightSerializer,
    DatasetSerializer, APIKeySerializer, IntelligenceSubmissionSerializer
)


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Izinkan request tanpa CSRF token (agar Flutter/Postman bisa akses)."""
    def enforce_csrf(self, request):
        return  # Skip CSRF check


class BaseUserViewSet(viewsets.ModelViewSet):
    """Base ViewSet: filter data hanya milik user yg login."""
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ─────────────────────────────────────────────────────────────
# DATA COLLECTION
# ─────────────────────────────────────────────────────────────
class DataEntryViewSet(BaseUserViewSet):
    """
    ViewSet DataEntry (Data Collection).

    GET    /api/v2/data-collection/          → list semua
    POST   /api/v2/data-collection/          → buat baru
    GET    /api/v2/data-collection/{id}/     → detail
    PUT    /api/v2/data-collection/{id}/     → update penuh
    PATCH  /api/v2/data-collection/{id}/     → update sebagian
    DELETE /api/v2/data-collection/{id}/     → hapus
    """
    queryset = DataEntry.objects.all().order_by('-created_at')
    serializer_class = DataEntrySerializer


# ─────────────────────────────────────────────────────────────
# ANALYSIS
# ─────────────────────────────────────────────────────────────
class AnalysisViewSet(BaseUserViewSet):
    """
    ViewSet Analysis.

    GET    /api/v2/analysis/          → list
    POST   /api/v2/analysis/          → buat (otomatis generate mock result)
    GET    /api/v2/analysis/{id}/     → detail
    PUT    /api/v2/analysis/{id}/     → update
    DELETE /api/v2/analysis/{id}/     → hapus
    """
    queryset = Analysis.objects.all().order_by('-created_at')
    serializer_class = AnalysisSerializer

    def perform_create(self, serializer):
        mock_result = {
            'summary': f'Analisis telah diproses',
            'metrics': {
                'accuracy': f"{(random.random() * 30 + 70):.1f}",
                'precision': f"{(random.random() * 30 + 70):.1f}",
                'recall': f"{(random.random() * 30 + 70):.1f}",
            },
            'findings': [
                'Pola data terdeteksi',
                'Korelasi positif ditemukan',
                'Anomali minor teridentifikasi',
            ]
        }
        serializer.save(user=self.request.user, result=mock_result, status='completed')


# ─────────────────────────────────────────────────────────────
# AI MODELS
# ─────────────────────────────────────────────────────────────
class AIModelViewSet(BaseUserViewSet):
    """
    ViewSet AIModel.

    GET    /api/v2/models/          → list
    POST   /api/v2/models/          → buat
    GET    /api/v2/models/{id}/     → detail
    PUT    /api/v2/models/{id}/     → update
    DELETE /api/v2/models/{id}/     → hapus
    """
    queryset = AIModel.objects.all().order_by('-created_at')
    serializer_class = AIModelSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status='draft')


# ─────────────────────────────────────────────────────────────
# VISUALIZATION
# ─────────────────────────────────────────────────────────────
class VisualizationViewSet(BaseUserViewSet):
    """
    ViewSet Visualization.

    GET    /api/v2/visualization/          → list
    POST   /api/v2/visualization/          → buat
    GET    /api/v2/visualization/{id}/     → detail
    PUT    /api/v2/visualization/{id}/     → update
    DELETE /api/v2/visualization/{id}/     → hapus
    """
    queryset = Visualization.objects.all().order_by('-created_at')
    serializer_class = VisualizationSerializer


# ─────────────────────────────────────────────────────────────
# TRAINING SESSION
# ─────────────────────────────────────────────────────────────
class TrainingSessionViewSet(BaseUserViewSet):
    """
    ViewSet TrainingSession.

    GET    /api/v2/training/          → list
    POST   /api/v2/training/          → buat sesi baru
    GET    /api/v2/training/{id}/     → detail
    PUT    /api/v2/training/{id}/     → update (progress, status)
    DELETE /api/v2/training/{id}/     → hapus

    Extra action:
    POST   /api/v2/training/{id}/complete/ → tandai selesai
    """
    queryset = TrainingSession.objects.all().order_by('-created_at')
    serializer_class = TrainingSessionSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status='queued', progress=0)

    def perform_update(self, serializer):
        instance = serializer.save()
        # Auto set completed_at jika status = completed
        if instance.status == 'completed' and not instance.completed_at:
            instance.completed_at = timezone.now()
            instance.save(update_fields=['completed_at'])

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """POST /api/v2/training/{id}/complete/ → tandai sesi selesai"""
        session = self.get_object()
        session.status = 'completed'
        session.progress = 100.0
        session.completed_at = timezone.now()
        session.save()
        return Response({'message': 'Sesi pelatihan ditandai selesai.'})


# ─────────────────────────────────────────────────────────────
# AUTOMATION (Workflow)
# ─────────────────────────────────────────────────────────────
class WorkflowViewSet(BaseUserViewSet):
    """
    ViewSet Workflow (Automation).

    GET    /api/v2/automation/          → list
    POST   /api/v2/automation/          → buat
    GET    /api/v2/automation/{id}/     → detail
    PUT    /api/v2/automation/{id}/     → update
    DELETE /api/v2/automation/{id}/     → hapus

    Extra action:
    POST   /api/v2/automation/{id}/toggle/ → aktif/nonaktif workflow
    """
    queryset = Workflow.objects.all().order_by('-created_at')
    serializer_class = WorkflowSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status='inactive')

    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        """POST /api/v2/automation/{id}/toggle/ → toggle status aktif"""
        workflow = self.get_object()
        workflow.status = 'active' if workflow.status == 'inactive' else 'inactive'
        workflow.save()
        serializer = self.get_serializer(workflow)
        return Response(serializer.data)


# ─────────────────────────────────────────────────────────────
# COLLABORATION
# ─────────────────────────────────────────────────────────────
class CollaborationViewSet(BaseUserViewSet):
    """
    ViewSet Collaboration.

    GET    /api/v2/collaboration/          → list
    POST   /api/v2/collaboration/          → buat
    GET    /api/v2/collaboration/{id}/     → detail
    PUT    /api/v2/collaboration/{id}/     → update
    DELETE /api/v2/collaboration/{id}/     → hapus
    """
    queryset = Collaboration.objects.all().order_by('-created_at')
    serializer_class = CollaborationSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status='active')


# ─────────────────────────────────────────────────────────────
# INSIGHTS
# ─────────────────────────────────────────────────────────────
class InsightViewSet(BaseUserViewSet):
    """
    ViewSet Insight.

    GET    /api/v2/insights/          → list
    POST   /api/v2/insights/          → buat
    GET    /api/v2/insights/{id}/     → detail
    PUT    /api/v2/insights/{id}/     → update
    DELETE /api/v2/insights/{id}/     → hapus
    """
    queryset = Insight.objects.all().order_by('-created_at')
    serializer_class = InsightSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status='new')


# ─────────────────────────────────────────────────────────────
# DATASET
# ─────────────────────────────────────────────────────────────
class DatasetViewSet(BaseUserViewSet):
    """
    ViewSet Dataset.

    GET    /api/v2/datasets/          → list
    POST   /api/v2/datasets/          → upload dataset (multipart/form-data)
    GET    /api/v2/datasets/{id}/     → detail
    PUT    /api/v2/datasets/{id}/     → update
    DELETE /api/v2/datasets/{id}/     → hapus (termasuk hapus file)
    """
    queryset = Dataset.objects.all().order_by('-created_at')
    serializer_class = DatasetSerializer

    def perform_destroy(self, instance):
        # Hapus file fisik jika ada
        if instance.file_upload:
            file_path = instance.file_upload.path
            if os.path.isfile(file_path):
                os.remove(file_path)
        instance.delete()


# ─────────────────────────────────────────────────────────────
# API KEY (hanya admin / superuser)
# ─────────────────────────────────────────────────────────────
class APIKeyViewSet(viewsets.ModelViewSet):
    """
    ViewSet APIKey — hanya bisa diakses superuser.

    GET    /api/v2/api-keys/          → list semua key
    POST   /api/v2/api-keys/          → buat key baru (auto-generate)
    GET    /api/v2/api-keys/{id}/     → detail
    PATCH  /api/v2/api-keys/{id}/     → update (misal nonaktifkan)
    DELETE /api/v2/api-keys/{id}/     → hapus

    Extra action:
    POST   /api/v2/api-keys/generate/ → generate key baru dengan nama
    """
    queryset = APIKey.objects.all().order_by('-created_at')
    serializer_class = APIKeySerializer
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_superuser:
            return APIKey.objects.all().order_by('-created_at')
        return APIKey.objects.none()

    def perform_create(self, serializer):
        serializer.save(key=APIKey.generate_key())

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """
        POST /api/v2/api-keys/generate/
        Body: { "name": "Tim A", "email": "tim@example.com" }
        → Generate API key baru
        """
        if not request.user.is_superuser:
            return Response(
                {'error': 'Hanya superuser yang bisa generate API key.'},
                status=status.HTTP_403_FORBIDDEN
            )
        name = request.data.get('name', '').strip()
        email = request.data.get('email', '').strip()
        if not name:
            return Response(
                {'error': 'Nama wajib diisi.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        api_key = APIKey.objects.create(
            key=APIKey.generate_key(),
            name=name,
            email=email or None,
            is_active=True,
        )
        return Response({
            'message': 'API key berhasil dibuat.',
            'api_key': {
                'id': api_key.id,
                'name': api_key.name,
                'email': api_key.email,
                'key': api_key.key,   # Tampilkan SEKALI saja saat dibuat
                'is_active': api_key.is_active,
                'created_at': api_key.created_at.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────
# INTELLIGENCE SUBMISSION (baca/kelola oleh tim internal)
# ─────────────────────────────────────────────────────────────
class IntelligenceSubmissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet IntelligenceSubmission — untuk tim internal memproses submission.

    GET    /api/v2/submissions/          → list semua submission
    GET    /api/v2/submissions/{id}/     → detail
    PATCH  /api/v2/submissions/{id}/     → update stage/status
    DELETE /api/v2/submissions/{id}/     → hapus

    Extra actions:
    POST   /api/v2/submissions/{id}/advance/ → naikkan stage +1
    POST   /api/v2/submissions/{id}/reject/  → tolak submission
    GET    /api/v2/submissions/stats/        → ringkasan statistik
    """
    queryset = IntelligenceSubmission.objects.all().order_by('-received_at')
    serializer_class = IntelligenceSubmissionSerializer
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = IntelligenceSubmission.objects.all().order_by('-received_at')

        # Filter opsional via query param
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(sender_name__icontains=search) |
                Q(description__icontains=search)
            )

        return qs

    def perform_update(self, serializer):
        import os
        old_status = self.get_object().status
        instance = serializer.save()
        
        # Jika status berubah menjadi 'sent' (Kirim Final)
        if old_status != 'sent' and instance.status == 'sent':
            import requests
            
            # URL API Implementasi (Hardcoded fallback ke VPS publik)
            target_url = os.environ.get('IMPLEMENTATION_API_URL', 'http://72.61.215.222/implementation/api-content/datasets/')
            
            try:
                data = {
                    'name': instance.sender_name or instance.title or 'Dataset',
                    'file_name': os.path.basename(instance.source_file.name) if instance.source_file else '-',
                    'file_type': instance.detected_data_type or 'unknown',
                    'activity': 'todo',
                    'version': 'v1.1',
                    'description': instance.description or 'Dikirim dari Intelligence Creation',
                    'source_type': 'api',
                    'user_email': instance.sender_email or 'ana', # default 'ana' based on screenshot
                }
                
                # Ambil score dari stage 1 jika ada
                pd = instance.pipeline_data or {}
                stage_1 = pd.get('stage_1', pd.get('1', {}))
                if isinstance(stage_1, dict) and 'quality_score' in stage_1:
                    data['quality_score'] = stage_1['quality_score']
                else:
                    data['quality_score'] = 88.0 # default if not found
                
                files = None
                if instance.source_file and os.path.exists(instance.source_file.path):
                    # Kami menggunakan field 'pdf_file' karena di sisi Implementation FileField-nya bernama 'pdf_file'
                    # walaupun file aslinya bisa CSV, PDF, dsb (bebas jenis file).
                    files = {'pdf_file': (os.path.basename(instance.source_file.name), open(instance.source_file.path, 'rb'))}
                
                if files:
                    response = requests.post(target_url, data=data, files=files, timeout=10)
                    files['pdf_file'][1].close() # pastikan file diclose
                else:
                    response = requests.post(target_url, data=data, timeout=10)
                    
                import logging
                logger = logging.getLogger(__name__)
                if response.status_code in [200, 201]:
                    logger.info(f"Berhasil mengirim ke Implementation API: {response.text}")
                else:
                    logger.error(f"Gagal mengirim ke Implementation API: {response.status_code} - {response.text}")
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Exception saat mengirim ke Implementation API: {str(e)}")

    @action(detail=True, methods=['post'])
    def run_stage(self, request, pk=None):
        """POST /api/v2/submissions/{id}/run_stage/ → Eksekusi skrip ML untuk tahap saat ini"""
        import subprocess
        import sys
        from django.conf import settings
        
        sub = self.get_object()
        stage = sub.current_stage
        
        # Helper: baca pipeline_data dengan fallback ke format kunci lama ('stage_N' vs 'N')
        def get_stage(n):
            pd = sub.pipeline_data or {}
            return pd.get(f'stage_{n}', pd.get(str(n), {}))

        # Check track and metadata
        track = get_stage(0).get('track', 'tabular')
        task_type = get_stage(0).get('task_type', 'classification')
        target_col = get_stage(1).get('target_column', '') or get_stage(0).get('suggested_target', 'target') or 'target'
        selected_model = get_stage(3).get('selected_model', 'Random Forest')

        source_file_path = sub.source_file.path

        # Helper to check file extensions
        def ext_img(path):
            return path.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.webp'))
        def ext_txt(path):
            return path.lower().endswith(('.txt', '.md', '.log'))

        # Subprocess execution wrapper
        def run_script(args):
            python_exe = sys.executable if hasattr(sys, 'executable') else 'python'
            # Look for local venv
            for venv_dir in ['venv', '.venv']:
                venv_python = os.path.join(settings.BASE_DIR, venv_dir, 'Scripts', 'python.exe')
                if os.path.exists(venv_python):
                    python_exe = venv_python
                    break
                    
            cmd = [python_exe] + args
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, cwd=settings.BASE_DIR)
                if res.returncode != 0:
                    return {"success": False, "error": res.stderr or "Script returned non-zero code"}
                return json.loads(res.stdout)
            except Exception as e:
                return {"success": False, "error": str(e)}

        result = {}
        # Switch stage
        if stage == 0:
            # Stage 0: Problem Framing
            res_json = run_script(['ml_engine/problem_framing.py', source_file_path])
            if res_json.get('error'):
                return Response({'success': False, 'error': res_json['error']}, status=status.HTTP_400_BAD_REQUEST)
            
            # Detect track/task_type
            detected_type = sub.detected_data_type
            if detected_type == 'unknown' or not detected_type:
                if ext_img(source_file_path):
                    detected_type = 'image'
                elif ext_txt(source_file_path) or source_file_path.lower().endswith('.zip'):
                    # Check ZIP content heuristically (done in recommend.py, here we check name/extension)
                    detected_type = 'image' if 'image' in source_file_path.lower() else 'text'
                else:
                    detected_type = 'tabular'
            
            track_val = 'deeplearning' if detected_type in ['image', 'text'] else 'tabular'
            task_val = 'classification'
            if detected_type == 'image':
                task_val = 'image_classification'
            elif detected_type == 'text':
                task_val = 'text_classification'
            else:
                task_val = 'regression' if res_json.get('category') == 'regresi' else 'classification'

            result = {
                "track": track_val,
                "task_type": task_val,
                "suggested_target": res_json.get('suggested_target', 'target'),
                "ipo": {
                    "input": res_json.get('input'),
                    "process": res_json.get('process'),
                    "output": res_json.get('output')
                }
            }
            if not sub.pipeline_data:
                sub.pipeline_data = {}
            sub.pipeline_data['stage_0'] = result
            sub.detected_data_type = detected_type
            sub.save(update_fields=['pipeline_data', 'detected_data_type'])
            
        elif stage == 1:
            # Stage 1: Dataset Definition
            if track == 'tabular':
                res_json = run_script(['ml_engine/analyze_data.py', source_file_path, target_col])
                if res_json.get('error'):
                    return Response({'success': False, 'error': res_json['error']}, status=status.HTTP_400_BAD_REQUEST)
                result = res_json
            elif task_type == 'image_classification':
                result = {
                    "quality_score": 95.0,
                    "target_column": "directory_name",
                    "columns_info": [{"name": "image_file", "type": "image", "missing": 0}],
                    "class_distribution": {}
                }
            else:  # text_classification
                result = {
                    "quality_score": 92.0,
                    "target_column": target_col,
                    "columns_info": [{"name": "text_content", "type": "text", "missing": 0}],
                    "class_distribution": {}
                }
            sub.pipeline_data['stage_1'] = result
            sub.save(update_fields=['pipeline_data'])

        elif stage == 2:
            # Stage 2: Data Preprocessing
            res_json = run_script(['ml_engine/data_processor.py', source_file_path, target_col, str(sub.id), track, task_type])
            if not res_json.get('success'):
                return Response({'success': False, 'error': res_json.get('error', 'Gagal memproses data')}, status=status.HTTP_400_BAD_REQUEST)
            result = res_json
            sub.pipeline_data['stage_2'] = result
            sub.save(update_fields=['pipeline_data'])

        elif stage == 3:
            # Stage 3: Model Recommendation
            res_json = run_script(['ml_engine/recommend.py', source_file_path, target_col])
            if res_json.get('error'):
                return Response({'success': False, 'error': res_json['error']}, status=status.HTTP_400_BAD_REQUEST)
            result = res_json
            sub.pipeline_data['stage_3'] = result
            sub.save(update_fields=['pipeline_data'])

        elif stage == 4:
            # Stage 4: Training & Testing
            if track == 'tabular':
                res_json = run_script(['ml_engine/train_test.py', source_file_path, target_col, selected_model])
            else:
                res_json = run_script(['ml_engine/deep_trainer.py', str(sub.id), selected_model, task_type])
                
            if not res_json.get('success', True):
                return Response({'success': False, 'error': res_json.get('error', 'Gagal melatih model')}, status=status.HTTP_400_BAD_REQUEST)
            result = res_json
            sub.pipeline_data['stage_4'] = result
            sub.save(update_fields=['pipeline_data'])

        elif stage == 5:
            # Stage 5: Refining
            res_json = run_script(['ml_engine/refiner.py', str(sub.id), selected_model, track, task_type])
            if not res_json.get('success'):
                return Response({'success': False, 'error': res_json.get('error', 'Gagal menyetel model')}, status=status.HTTP_400_BAD_REQUEST)
            result = res_json
            sub.pipeline_data['stage_5'] = result
            sub.save(update_fields=['pipeline_data'])

        elif stage == 6 or stage == 7:
            # Stage 6 & 7: Laporan
            temp_json_path = os.path.join(settings.MEDIA_ROOT, 'processed_data', str(sub.id), 'pipeline_data.json')
            os.makedirs(os.path.dirname(temp_json_path), exist_ok=True)
            with open(temp_json_path, 'w', encoding='utf-8') as f:
                json.dump(sub.pipeline_data, f, ensure_ascii=False)
                
            res_json = run_script(['ml_engine/report_generator.py', temp_json_path, str(stage)])
            if not res_json.get('success'):
                return Response({'success': False, 'error': res_json.get('error', 'Gagal menghasilkan laporan')}, status=status.HTTP_400_BAD_REQUEST)
            
            result = res_json
            sub.pipeline_data[f'stage_{stage}'] = result
            sub.save(update_fields=['pipeline_data'])

        return Response({
            "success": True,
            "stage": stage,
            "result": result
        })

    @action(detail=True, methods=['post'])
    def approve_stage(self, request, pk=None):
        """POST /api/v2/submissions/{id}/approve_stage/ → Setujui tahap dan lanjut"""
        sub = self.get_object()
        stage = sub.current_stage
        
        # Save inputs if passed
        # Pastikan pipeline_data adalah dict
        if not isinstance(sub.pipeline_data, dict):
            sub.pipeline_data = {}
        
        # Helper: baca stage dengan fallback ke format kunci lama
        def get_stage_data(n):
            pd_data = sub.pipeline_data or {}
            return pd_data.get(f'stage_{n}', pd_data.get(str(n), {}))
        
        def set_stage_data(n, data):
            sub.pipeline_data[f'stage_{n}'] = data
            sub.pipeline_data[str(n)] = data  # backward compat

        # Simpan data panggung secara langsung jika dikirim dari form manual
        stage_data_input = request.data.get('stage_data')
        if stage_data_input:
            set_stage_data(stage, stage_data_input)

        # Kompatibilitas dengan input target_column dan selected_model lama
        if stage == 0:
            target_col = request.data.get('target_column') or (stage_data_input.get('suggested_target') if stage_data_input else None) or 'target'
            s0 = get_stage_data(0)
            s0['suggested_target'] = target_col
            set_stage_data(0, s0)
        elif stage == 1:
            target_col = request.data.get('target_column') or (stage_data_input.get('target_column') if stage_data_input else None) or 'target'
            s1 = get_stage_data(1)
            s1['target_column'] = target_col
            set_stage_data(1, s1)
        elif stage == 3:
            selected_model = request.data.get('selected_model') or (stage_data_input.get('selected_model') if stage_data_input else None)
            if selected_model:
                s3 = get_stage_data(3)
                s3['selected_model'] = selected_model
                set_stage_data(3, s3)
        
        if stage >= 7:
            sub.status = 'completed'
            sub.completed_at = timezone.now()
            sub.save()
            return Response({
                "success": True,
                "message": "Seluruh 8 tahap selesai! Model siap digunakan.",
                "status": sub.status,
                "current_stage": sub.current_stage
            })

        if sub.status == 'pending':
            sub.status = 'in_progress'
            sub.started_processing_at = timezone.now()
        else:
            sub.current_stage += 1
        sub.save()
        
        return Response({
            "success": True,
            "current_stage": sub.current_stage,
            "status": sub.status,
            "pipeline_data": sub.pipeline_data
        })

    @action(detail=True, methods=['post'])
    def advance(self, request, pk=None):
        """Alias untuk approve_stage (backward compatibility)"""
        return self.approve_stage(request, pk)

    @action(detail=True, methods=['post'])
    def predict(self, request, pk=None):
        """POST /api/v2/submissions/{id}/predict/ → Uji prediksi real-time dengan model terpilih"""
        import subprocess
        import sys
        from django.conf import settings
        
        sub = self.get_object()
        if sub.status != 'completed':
            return Response({'error': 'Model belum siap. Selesaikan seluruh 8 tahap terlebih dahulu.'}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES.get('file')
        input_text = request.data.get('input_text')
        
        mode = 'json'
        input_data = ""
        temp_file_path = None
        
        if uploaded_file:
            mode = 'file'
            temp_dir = os.path.join(settings.MEDIA_ROOT, 'processed_data', str(sub.id), 'temp_pred')
            os.makedirs(temp_dir, exist_ok=True)
            temp_file_path = os.path.join(temp_dir, uploaded_file.name)
            with open(temp_file_path, 'wb+') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
            input_data = temp_file_path
        elif input_text:
            mode = 'json'
            input_data = input_text
        else:
            try:
                input_data = json.dumps(request.data)
            except:
                return Response({'error': 'Input data tidak valid.'}, status=status.HTTP_400_BAD_REQUEST)

        # Execute prediction script
        python_exe = sys.executable if hasattr(sys, 'executable') else 'python'
        for venv_dir in ['venv', '.venv']:
            venv_python = os.path.join(settings.BASE_DIR, venv_dir, 'Scripts', 'python.exe')
            if os.path.exists(venv_python):
                python_exe = venv_python
                break
                
        cmd = [python_exe, 'ml_engine/predict.py', str(sub.id), input_data, mode]
        
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, cwd=settings.BASE_DIR)
            
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                
            if res.returncode != 0:
                return Response({'error': res.stderr or 'Error during prediction process'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
            res_json = json.loads(res.stdout)
            if not res_json.get('success'):
                return Response({'error': res_json.get('error', 'Gagal memproses prediksi')}, status=status.HTTP_400_BAD_REQUEST)
                
            return Response(res_json)
        except Exception as e:
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """POST /api/v2/submissions/{id}/reject/ → tolak submission"""
        sub = self.get_object()
        sub.status = 'rejected'
        note = request.data.get('reason', '')
        if note:
            sub.internal_notes = (sub.internal_notes or '') + f'\n[REJECTED] {note}'
        sub.save()
        return Response({'message': 'Submission ditolak.', 'id': sub.id})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """GET /api/v2/submissions/stats/ → statistik submission"""
        total = IntelligenceSubmission.objects.count()
        return Response({
            'total': total,
            'pending': IntelligenceSubmission.objects.filter(status='pending').count(),
            'in_progress': IntelligenceSubmission.objects.filter(status='in_progress').count(),
            'completed': IntelligenceSubmission.objects.filter(status='completed').count(),
            'rejected': IntelligenceSubmission.objects.filter(status='rejected').count(),
            'sent': IntelligenceSubmission.objects.filter(status='sent').count(),
            'api_submissions': IntelligenceSubmission.objects.filter(
                api_key_used__isnull=False
            ).count(),
            'manual_submissions': IntelligenceSubmission.objects.filter(
                api_key_used__isnull=True
            ).count(),
        })
