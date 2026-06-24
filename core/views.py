from core.serializers import DataEntrySerializer
import json
import os
import random
import traceback
from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.conf import settings
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from .models import (User, DataEntry, Analysis, AIModel, Visualization, 
                     TrainingSession, Workflow, Collaboration, Insight, Dataset)
from django.utils import timezone

from rest_framework.response import Response
from rest_framework.decorators import api_view

try:
    import pandas as pd
    import numpy as np
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LinearRegression
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, mean_squared_error
    from sklearn.preprocessing import LabelEncoder
    import joblib
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False


@api_view(['GET'])
def ambil_data_entry(request):
    # Mengambil semua data yang ada di tabel DataEntry
    data = DataEntry.objects.all()
    # Mengubah data database jadi format JSON
    serializer = DataEntrySerializer(data, many=True)
    return Response(serializer.data)

def landing_page(request):
    return render(request, 'index.html')

def login_page(request):
    if request.user.is_authenticated:
        return redirect('/creation/dashboard.html')
    return render(request, 'login.html')

def register_page(request):
    if request.user.is_authenticated:
        return redirect('/creation/dashboard.html')
    return render(request, 'register.html')

def dashboard_page(request):
    if not request.user.is_authenticated:
        return redirect('/creation/login.html')
    return render(request, 'dashboard.html')

# === AUTH API ===
@csrf_exempt
def api_register(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            name = data.get('name', '').strip()
            email = data.get('email', '').strip().lower()
            password = data.get('password')
            
            if not name or not email or not password:
                return JsonResponse({'error': 'Semua field harus diisi'}, status=400)
            if len(password) < 6:
                return JsonResponse({'error': 'Password minimal 6 karakter'}, status=400)
            if User.objects.filter(email__iexact=email).exists():
                return JsonResponse({'error': 'Email sudah terdaftar'}, status=400)
                
            colors = ['#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6']
            avatar_color = random.choice(colors)
            
            user = User.objects.create_user(username=email, email=email, password=password, first_name=name, avatar_color=avatar_color)
            
            # Log the user in immediately
            auth_login(request, user, backend='django.contrib.auth.backends.ModelBackend')
            
            return JsonResponse({
                'message': 'Registrasi berhasil!',
                'user': {'id': user.id, 'name': user.first_name, 'email': user.email, 'avatar_color': user.avatar_color}
            }, status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def api_login(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            email = data.get('email', '').strip().lower()
            password = data.get('password')
            
            if not email or not password:
                return JsonResponse({'error': 'Email dan password harus diisi'}, status=400)
                
            user = authenticate(request, username=email, password=password)
            if user is not None:
                auth_login(request, user)
                return JsonResponse({
                    'message': 'Login berhasil!',
                    'user': {'id': user.id, 'name': user.first_name, 'email': user.email, 'avatar_color': getattr(user, 'avatar_color', '#7c3aed')}
                })
            else:
                return JsonResponse({'error': 'Email atau password salah'}, status=401)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def api_logout(request):
    if request.method == 'POST':
        auth_logout(request)
        return JsonResponse({'message': 'Logout berhasil'})

def api_me(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Belum login'}, status=401)
    user = request.user
    return JsonResponse({'user': {
        'id': user.id, 
        'name': user.first_name, 
        'email': user.email, 
        'avatar_color': getattr(user, 'avatar_color', '#7c3aed'),
        'created_at': user.date_joined.isoformat()
    }})

# Helper decorator for API auth
def api_login_required(view_func):
    def wrapped_view(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Silakan login terlebih dahulu'}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapped_view

# === FEATURES API ===
@csrf_exempt
@api_login_required
def api_data_collection(request, pk=None):
    if request.method == 'GET':
        entries = DataEntry.objects.filter(user=request.user).order_by('-created_at')
        data = list(entries.values('id', 'title', 'content', 'category', 'data_type', 'tags', 'created_at', 'updated_at'))
        return JsonResponse({'data': data})
        
    elif request.method == 'POST':
        data = json.loads(request.body)
        title = data.get('title')
        if not title:
            return JsonResponse({'error': 'Judul harus diisi'}, status=400)
        entry = DataEntry.objects.create(
            user=request.user,
            title=title,
            content=data.get('content', ''),
            category=data.get('category', 'umum'),
            data_type=data.get('data_type', 'text'),
            tags=data.get('tags', [])
        )
        return JsonResponse({'message': 'Data berhasil ditambahkan', 'data': {'id': entry.id, 'title': entry.title, 'content': entry.content, 'category': entry.category, 'data_type': entry.data_type, 'tags': entry.tags}}, status=201)
        
    elif request.method == 'PUT' and pk:
        data = json.loads(request.body)
        try:
            entry = DataEntry.objects.get(id=pk, user=request.user)
        except DataEntry.DoesNotExist:
            return JsonResponse({'error': 'Data tidak ditemukan'}, status=404)
            
        entry.title = data.get('title', entry.title)
        entry.content = data.get('content', entry.content)
        entry.category = data.get('category', entry.category)
        entry.data_type = data.get('data_type', entry.data_type)
        entry.tags = data.get('tags', entry.tags)
        entry.save()
        return JsonResponse({'message': 'Data berhasil diperbarui', 'data': {'id': entry.id, 'title': entry.title, 'content': entry.content}})
        
    elif request.method == 'DELETE' and pk:
        try:
            entry = DataEntry.objects.get(id=pk, user=request.user)
            entry.delete()
            return JsonResponse({'message': 'Data berhasil dihapus'})
        except DataEntry.DoesNotExist:
            return JsonResponse({'error': 'Data tidak ditemukan'}, status=404)

@csrf_exempt
@api_login_required
def api_analysis(request, pk=None):
    if request.method == 'GET':
        items = Analysis.objects.filter(user=request.user).order_by('-created_at')
        data = []
        for item in items:
            data.append({
                'id': item.id, 'title': item.title, 'method': item.method, 'result': item.result,
                'status': item.status, 'created_at': item.created_at, 'data_title': item.data_entry.title if item.data_entry else None
            })
        return JsonResponse({'data': data})
        
    elif request.method == 'POST':
        data = json.loads(request.body)
        title = data.get('title')
        data_entry_id = data.get('data_entry_id')
        method = data.get('method', 'statistical')
        if not title:
            return JsonResponse({'error': 'Judul analisis harus diisi'}, status=400)
            
        mock_result = {
            'summary': f'Analisis "{title}" telah diproses',
            'metrics': {'accuracy': f"{(random.random() * 30 + 70):.1f}", 'precision': f"{(random.random() * 30 + 70):.1f}", 'recall': f"{(random.random() * 30 + 70):.1f}"},
            'findings': ['Pola data terdeteksi', 'Korelasi positif ditemukan', 'Anomali minor teridentifikasi']
        }
        
        analysis = Analysis.objects.create(
            user=request.user,
            data_entry_id=data_entry_id,
            title=title,
            method=method,
            result=mock_result,
            status='completed'
        )
        return JsonResponse({'message': 'Analisis berhasil dibuat', 'data': {'id': analysis.id, 'title': analysis.title}}, status=201)
        
    elif request.method == 'PUT' and pk:
        data = json.loads(request.body)
        try:
            item = Analysis.objects.get(id=pk, user=request.user)
        except Analysis.DoesNotExist:
            return JsonResponse({'error': 'Analisis tidak ditemukan'}, status=404)
        item.title = data.get('title', item.title)
        item.method = data.get('method', item.method)
        item.status = data.get('status', item.status)
        item.save()
        return JsonResponse({'message': 'Analisis berhasil diperbarui'})
        
    elif request.method == 'DELETE' and pk:
        try:
            item = Analysis.objects.get(id=pk, user=request.user)
            item.delete()
            return JsonResponse({'message': 'Analisis berhasil dihapus'})
        except Analysis.DoesNotExist:
            return JsonResponse({'error': 'Analisis tidak ditemukan'}, status=404)

@csrf_exempt
@api_login_required
def api_models(request, pk=None):
    if request.method == 'GET':
        items = list(AIModel.objects.filter(user=request.user).order_by('-created_at').values())
        return JsonResponse({'data': items})
    elif request.method == 'POST':
        data = json.loads(request.body)
        title = data.get('name')
        if not title: return JsonResponse({'error': 'Nama model harus diisi'}, status=400)
        item = AIModel.objects.create(
            user=request.user, name=title, model_type=data.get('model_type', 'classification'),
            description=data.get('description', ''), config=data.get('config', {}), status='draft'
        )
        return JsonResponse({'message': 'Model berhasil dibuat', 'data': {'id': item.id, 'name': item.name}}, status=201)
    elif request.method == 'PUT' and pk:
        data = json.loads(request.body)
        try: item = AIModel.objects.get(id=pk, user=request.user)
        except AIModel.DoesNotExist: return JsonResponse({'error': 'Model tidak ditemukan'}, status=404)
        item.name = data.get('name', item.name)
        item.model_type = data.get('model_type', item.model_type)
        item.description = data.get('description', item.description)
        item.config = data.get('config', item.config)
        item.status = data.get('status', item.status)
        item.accuracy = data.get('accuracy', item.accuracy)
        item.save()
        return JsonResponse({'message': 'Model berhasil diperbarui'})
    elif request.method == 'DELETE' and pk:
        try: item = AIModel.objects.get(id=pk, user=request.user); item.delete(); return JsonResponse({'message': 'Model berhasil dihapus'})
        except: return JsonResponse({'error': 'Model tidak ditemukan'}, status=404)

@csrf_exempt
@api_login_required
def api_visualization(request, pk=None):
    if request.method == 'GET':
        items = list(Visualization.objects.filter(user=request.user).order_by('-created_at').values())
        return JsonResponse({'data': items})
    elif request.method == 'POST':
        data = json.loads(request.body)
        title = data.get('title')
        if not title: return JsonResponse({'error': 'Judul visualisasi harus diisi'}, status=400)
        item = Visualization.objects.create(
            user=request.user, title=title, chart_type=data.get('chart_type', 'bar'),
            data_source=data.get('data_source', ''), config=data.get('config', {})
        )
        return JsonResponse({'message': 'Visualisasi berhasil dibuat', 'data': {'id': item.id, 'title': item.title}}, status=201)
    elif request.method == 'PUT' and pk:
        data = json.loads(request.body)
        try: item = Visualization.objects.get(id=pk, user=request.user)
        except Visualization.DoesNotExist: return JsonResponse({'error': 'Visualisasi tidak ditemukan'}, status=404)
        item.title = data.get('title', item.title)
        item.chart_type = data.get('chart_type', item.chart_type)
        item.data_source = data.get('data_source', item.data_source)
        item.config = data.get('config', item.config)
        item.save()
        return JsonResponse({'message': 'Visualisasi berhasil diperbarui'})
    elif request.method == 'DELETE' and pk:
        try: item = Visualization.objects.get(id=pk, user=request.user); item.delete(); return JsonResponse({'message': 'Visualisasi berhasil dihapus'})
        except: return JsonResponse({'error': 'Visualisasi tidak ditemukan'}, status=404)

@csrf_exempt
@api_login_required
def api_training(request, pk=None):
    if request.method == 'GET':
        items = TrainingSession.objects.filter(user=request.user).order_by('-created_at')
        data = []
        for item in items:
            data.append({
                'id': item.id, 'name': item.name, 'dataset': item.dataset, 'epochs': item.epochs,
                'progress': item.progress, 'status': item.status, 'log': item.log, 'created_at': item.created_at,
                'model_name': item.model.name if item.model else None
            })
        return JsonResponse({'data': data})
    elif request.method == 'POST':
        data = json.loads(request.body)
        name = data.get('name')
        if not name: return JsonResponse({'error': 'Nama sesi pelatihan harus diisi'}, status=400)
        item = TrainingSession.objects.create(
            user=request.user, model_id=data.get('model_id'), name=name,
            dataset=data.get('dataset', ''), epochs=data.get('epochs', 10), progress=0, status='queued'
        )
        return JsonResponse({'message': 'Sesi pelatihan berhasil dibuat', 'data': {'id': item.id, 'name': item.name}}, status=201)
    elif request.method == 'PUT' and pk:
        data = json.loads(request.body)
        try: item = TrainingSession.objects.get(id=pk, user=request.user)
        except TrainingSession.DoesNotExist: return JsonResponse({'error': 'Sesi pelatihan tidak ditemukan'}, status=404)
        item.name = data.get('name', item.name)
        item.progress = data.get('progress', item.progress)
        item.status = data.get('status', item.status)
        item.log = data.get('log', item.log)
        if item.status == 'completed' and not item.completed_at: item.completed_at = timezone.now()
        item.save()
        return JsonResponse({'message': 'Sesi pelatihan berhasil diperbarui'})
    elif request.method == 'DELETE' and pk:
        try: item = TrainingSession.objects.get(id=pk, user=request.user); item.delete(); return JsonResponse({'message': 'Sesi pelatihan berhasil dihapus'})
        except: return JsonResponse({'error': 'Sesi pelatihan tidak ditemukan'}, status=404)

@csrf_exempt
@api_login_required
def api_automation(request, pk=None):
    if request.method == 'GET':
        items = list(Workflow.objects.filter(user=request.user).order_by('-created_at').values())
        return JsonResponse({'data': items})
    elif request.method == 'POST':
        data = json.loads(request.body)
        name = data.get('name')
        if not name: return JsonResponse({'error': 'Nama workflow harus diisi'}, status=400)
        item = Workflow.objects.create(
            user=request.user, name=name, description=data.get('description', ''),
            steps=data.get('steps', []), trigger_type=data.get('trigger_type', 'manual'), status='inactive'
        )
        return JsonResponse({'message': 'Workflow berhasil dibuat', 'data': {'id': item.id, 'name': item.name}}, status=201)
    elif request.method == 'PUT' and pk:
        data = json.loads(request.body)
        try: item = Workflow.objects.get(id=pk, user=request.user)
        except Workflow.DoesNotExist: return JsonResponse({'error': 'Workflow tidak ditemukan'}, status=404)
        item.name = data.get('name', item.name)
        item.description = data.get('description', item.description)
        item.steps = data.get('steps', item.steps)
        item.trigger_type = data.get('trigger_type', item.trigger_type)
        item.status = data.get('status', item.status)
        item.save()
        return JsonResponse({'message': 'Workflow berhasil diperbarui'})
    elif request.method == 'DELETE' and pk:
        try: item = Workflow.objects.get(id=pk, user=request.user); item.delete(); return JsonResponse({'message': 'Workflow berhasil dihapus'})
        except: return JsonResponse({'error': 'Workflow tidak ditemukan'}, status=404)

@csrf_exempt
@api_login_required
def api_collaboration(request, pk=None):
    if request.method == 'GET':
        items = list(Collaboration.objects.filter(user=request.user).order_by('-created_at').values())
        return JsonResponse({'data': items})
    elif request.method == 'POST':
        data = json.loads(request.body)
        name = data.get('project_name')
        if not name: return JsonResponse({'error': 'Nama proyek harus diisi'}, status=400)
        item = Collaboration.objects.create(
            user=request.user, project_name=name, description=data.get('description', ''),
            members=data.get('members', []), visibility=data.get('visibility', 'private'), status='active'
        )
        return JsonResponse({'message': 'Proyek kolaborasi berhasil dibuat', 'data': {'id': item.id, 'project_name': item.project_name}}, status=201)
    elif request.method == 'PUT' and pk:
        data = json.loads(request.body)
        try: item = Collaboration.objects.get(id=pk, user=request.user)
        except Collaboration.DoesNotExist: return JsonResponse({'error': 'Proyek kolaborasi tidak ditemukan'}, status=404)
        item.project_name = data.get('project_name', item.project_name)
        item.description = data.get('description', item.description)
        item.members = data.get('members', item.members)
        item.visibility = data.get('visibility', item.visibility)
        item.status = data.get('status', item.status)
        item.save()
        return JsonResponse({'message': 'Proyek kolaborasi berhasil diperbarui'})
    elif request.method == 'DELETE' and pk:
        try: item = Collaboration.objects.get(id=pk, user=request.user); item.delete(); return JsonResponse({'message': 'Proyek kolaborasi berhasil dihapus'})
        except: return JsonResponse({'error': 'Proyek kolaborasi tidak ditemukan'}, status=404)

@csrf_exempt
@api_login_required
def api_insights(request, pk=None):
    if request.method == 'GET':
        items = list(Insight.objects.filter(user=request.user).order_by('-created_at').values())
        return JsonResponse({'data': items})
    elif request.method == 'POST':
        data = json.loads(request.body)
        title = data.get('title')
        if not title: return JsonResponse({'error': 'Judul insight harus diisi'}, status=400)
        item = Insight.objects.create(
            user=request.user, title=title, content=data.get('content', ''),
            insight_type=data.get('insight_type', 'observation'), priority=data.get('priority', 'medium'), status='new'
        )
        return JsonResponse({'message': 'Insight berhasil ditambahkan', 'data': {'id': item.id, 'title': item.title}}, status=201)
    elif request.method == 'PUT' and pk:
        data = json.loads(request.body)
        try: item = Insight.objects.get(id=pk, user=request.user)
        except Insight.DoesNotExist: return JsonResponse({'error': 'Insight tidak ditemukan'}, status=404)
        item.title = data.get('title', item.title)
        item.content = data.get('content', item.content)
        item.insight_type = data.get('insight_type', item.insight_type)
        item.priority = data.get('priority', item.priority)
        item.status = data.get('status', item.status)
        item.save()
        return JsonResponse({'message': 'Insight berhasil diperbarui'})
    elif request.method == 'DELETE' and pk:
        try: item = Insight.objects.get(id=pk, user=request.user); item.delete(); return JsonResponse({'message': 'Insight berhasil dihapus'})
        except: return JsonResponse({'error': 'Insight tidak ditemukan'}, status=404)

@api_login_required
def api_stats(request):
    user = request.user
    stats = {
        'data_collection': DataEntry.objects.filter(user=user).count(),
        'analysis': Analysis.objects.filter(user=user).count(),
        'models': AIModel.objects.filter(user=user).count(),
        'visualization': Visualization.objects.filter(user=user).count(),
        'training': TrainingSession.objects.filter(user=user).count(),
        'automation': Workflow.objects.filter(user=user).count(),
        'collaboration': Collaboration.objects.filter(user=user).count(),
        'insights': Insight.objects.filter(user=user).count(),
        'datasets': Dataset.objects.filter(user=user).count(),
    }
    return JsonResponse({'stats': stats})

@csrf_exempt
@api_login_required
def api_dataset(request, pk=None):
    if request.method == 'GET':
        items = Dataset.objects.filter(user=request.user).order_by('-created_at')
        data = []
        for item in items:
            data.append({
                'id': item.id,
                'nama_data': item.nama_data,
                'tipe_data': item.tipe_data,
                'file_upload': item.file_upload.url if item.file_upload else None,
                'content_teks': item.content_teks,
                'label': item.label,
                'created_at': item.created_at.isoformat(),
            })
        return JsonResponse({'data': data})

    elif request.method == 'POST':
        nama_data = request.POST.get('nama_data') or (json.loads(request.body).get('nama_data') if request.body else None)
        if not nama_data:
            return JsonResponse({'error': 'Nama data harus diisi'}, status=400)

        tipe_data = request.POST.get('tipe_data') or json.loads(request.body).get('tipe_data', 'numerik')
        content_teks = request.POST.get('content_teks') or json.loads(request.body).get('content_teks', '')
        label = request.POST.get('label') or json.loads(request.body).get('label', '')

        dataset = Dataset.objects.create(
            user=request.user,
            nama_data=nama_data,
            tipe_data=tipe_data,
            content_teks=content_teks,
            label=label,
        )

        if 'file_upload' in request.FILES:
            dataset.file_upload = request.FILES['file_upload']
            dataset.save()

        return JsonResponse({
            'message': 'Dataset berhasil ditambahkan',
            'data': {
                'id': dataset.id,
                'nama_data': dataset.nama_data,
                'tipe_data': dataset.tipe_data,
                'label': dataset.label,
            }
        }, status=201)

    elif request.method == 'PUT' and pk:
        data = json.loads(request.body)
        try:
            item = Dataset.objects.get(id=pk, user=request.user)
        except Dataset.DoesNotExist:
            return JsonResponse({'error': 'Dataset tidak ditemukan'}, status=404)

        item.nama_data = data.get('nama_data', item.nama_data)
        item.tipe_data = data.get('tipe_data', item.tipe_data)
        item.content_teks = data.get('content_teks', item.content_teks)
        item.label = data.get('label', item.label)
        item.save()
        return JsonResponse({'message': 'Dataset berhasil diperbarui'})

    elif request.method == 'DELETE' and pk:
        try:
            item = Dataset.objects.get(id=pk, user=request.user)
            if item.file_upload:
                if os.path.isfile(item.file_upload.path):
                    os.remove(item.file_upload.path)
            item.delete()
            return JsonResponse({'message': 'Dataset berhasil dihapus'})
        except Dataset.DoesNotExist:
            return JsonResponse({'error': 'Dataset tidak ditemukan'}, status=404)

@csrf_exempt
@api_login_required
def start_training(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method tidak diizinkan'}, status=405)

    if not ML_AVAILABLE:
        return JsonResponse({
            'error': 'Library ML belum terinstall. Jalankan: pip install pandas numpy scikit-learn joblib'
        }, status=500)

    try:
        data = json.loads(request.body)
        dataset_id = data.get('dataset_id')
        model_name = data.get('model_name', 'Model Baru')
        model_type = data.get('model_type', 'classification')
        epochs = data.get('epochs', 10)

        if not dataset_id:
            return JsonResponse({'error': 'Dataset ID harus diisi'}, status=400)

        try:
            dataset = Dataset.objects.get(id=dataset_id, user=request.user)
        except Dataset.DoesNotExist:
            return JsonResponse({'error': 'Dataset tidak ditemukan'}, status=404)

        training_session = TrainingSession.objects.create(
            user=request.user,
            name=f"Training: {model_name}",
            dataset=dataset.nama_data,
            epochs=epochs,
            progress=0.0,
            status='running',
            log=[{'step': 'initialization', 'message': 'Memulai training...'}],
        )

        os.makedirs(os.path.join(settings.MEDIA_ROOT, 'models'), exist_ok=True)
        model_path = os.path.join(settings.MEDIA_ROOT, 'models', f"{model_name.replace(' ', '_')}_{training_session.id}.joblib")

        result = {}

        if dataset.tipe_data == 'numerik' and dataset.file_upload:
            file_path = dataset.file_upload.path
            if not file_path.endswith('.csv'):
                return JsonResponse({'error': 'File harus berformat CSV'}, status=400)

            df = pd.read_csv(file_path)
            training_session.log.append({'step': 'data_loaded', 'message': f'Data loaded: {df.shape[0]} rows, {df.shape[1]} columns'})
            training_session.save()

            label_col = dataset.label or df.columns[-1]
            if label_col not in df.columns:
                return JsonResponse({'error': f'Kolom label "{label_col}" tidak ditemukan'}, status=400)

            df = df.dropna()
            X = df.drop(columns=[label_col])
            y = df[label_col]

            for col in X.select_dtypes(include=['object', 'category']).columns:
                le = LabelEncoder()
                X[col] = le.fit_transform(X[col].astype(str))

            if model_type == 'classification':
                if y.dtype == 'object' or y.dtype == 'category':
                    le_y = LabelEncoder()
                    y = le_y.fit_transform(y.astype(str))
                else:
                    le_y = None

                X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
                model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=10)
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                accuracy = accuracy_score(y_test, y_pred)

                result = {
                    'type': 'classification',
                    'accuracy': round(float(accuracy) * 100, 2),
                    'features': list(X.columns),
                    'label_column': label_col,
                    'n_samples': len(df),
                    'n_train': len(X_train),
                    'n_test': len(X_test),
                }
                if le_y is not None:
                    result['classes'] = list(le_y.classes_)

            else:
                X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
                model = LinearRegression()
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                mse = mean_squared_error(y_test, y_pred)

                result = {
                    'type': 'regression',
                    'mse': round(float(mse), 4),
                    'rmse': round(float(mse ** 0.5), 4),
                    'features': list(X.columns),
                    'label_column': label_col,
                    'n_samples': len(df),
                }

            pipeline = {'model': model, 'result': result}
            if dataset.tipe_data == 'numerik':
                pipeline['columns'] = list(X.columns)
                pipeline['label_column'] = label_col

            joblib.dump(pipeline, model_path)

        elif dataset.tipe_data == 'teks' and dataset.content_teks:
            lines = dataset.content_teks.strip().split('\n')
            texts = []
            labels = []
            for line in lines:
                parts = line.split('\t') if '\t' in line else line.split(',')
                if len(parts) >= 2:
                    texts.append(parts[0].strip())
                    labels.append(parts[1].strip())

            if not texts:
                return JsonResponse({'error': 'Format teks tidak valid. Gunakan format: teks<TAB>label'}, status=400)

            le = LabelEncoder()
            y = le.fit_transform(labels)

            from sklearn.feature_extraction.text import TfidfVectorizer
            vectorizer = TfidfVectorizer(max_features=1000)
            X = vectorizer.fit_transform(texts)

            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            model = RandomForestClassifier(n_estimators=100, random_state=42)
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            accuracy = accuracy_score(y_test, y_pred)

            result = {
                'type': 'text_classification',
                'accuracy': round(float(accuracy) * 100, 2),
                'n_samples': len(texts),
                'n_classes': len(le.classes_),
                'classes': list(le.classes_),
            }

            pipeline = {
                'model': model,
                'vectorizer': vectorizer,
                'label_encoder': le,
                'result': result,
            }
            joblib.dump(pipeline, model_path)

        else:
            return JsonResponse({'error': 'Tipe data tidak didukung untuk training'}, status=400)

        training_session.progress = 100.0
        training_session.status = 'completed'
        training_session.completed_at = timezone.now()
        training_session.log.append({'step': 'completed', 'message': f'Training selesai. Akurasi: {result.get("accuracy", "N/A")}%'})
        training_session.save()

        ai_model = AIModel.objects.create(
            user=request.user,
            name=model_name,
            model_type=model_type,
            description=f'Model trained from dataset: {dataset.nama_data}',
            config=result,
            status='trained',
            accuracy=result.get('accuracy', 0.0),
        )

        return JsonResponse({
            'message': 'Training berhasil!',
            'result': result,
            'model_id': ai_model.id,
            'training_session_id': training_session.id,
            'model_path': model_path,
        })

    except Exception as e:
        if 'training_session' in locals():
            training_session.status = 'failed'
            training_session.log.append({'step': 'error', 'message': str(e)})
            training_session.save()
        return JsonResponse({
            'error': f'Training gagal: {str(e)}',
            'traceback': traceback.format_exc(),
        }, status=500)

@csrf_exempt
@api_login_required
def predict(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method tidak diizinkan'}, status=405)

    if not ML_AVAILABLE:
        return JsonResponse({'error': 'Library ML belum terinstall'}, status=500)

    try:
        data = json.loads(request.body)
        model_id = data.get('model_id')
        input_data = data.get('input_data')

        if not model_id or input_data is None:
            return JsonResponse({'error': 'model_id dan input_data harus diisi'}, status=400)

        try:
            ai_model = AIModel.objects.get(id=model_id, user=request.user)
        except AIModel.DoesNotExist:
            return JsonResponse({'error': 'Model tidak ditemukan'}, status=404)

        model_files = [f for f in os.listdir(os.path.join(settings.MEDIA_ROOT, 'models')) if f.startswith(ai_model.name.replace(' ', '_'))]
        if not model_files:
            return JsonResponse({'error': 'File model tidak ditemukan'}, status=404)

        model_path = os.path.join(settings.MEDIA_ROOT, 'models', model_files[0])
        pipeline = joblib.load(model_path)

        model = pipeline['model']

        if 'vectorizer' in pipeline:
            input_vectorized = pipeline['vectorizer'].transform([input_data])
            prediction = model.predict(input_vectorized)[0]
            predicted_label = pipeline['label_encoder'].inverse_transform([prediction])[0]
        else:
            if isinstance(input_data, dict):
                df_input = pd.DataFrame([input_data])
                for col in pipeline.get('columns', []):
                    if col not in df_input.columns:
                        df_input[col] = 0
                df_input = df_input[pipeline.get('columns', df_input.columns)]
                for col in df_input.select_dtypes(include=['object', 'category']).columns:
                    df_input[col] = df_input[col].astype(str)
                prediction = model.predict(df_input)[0]
                predicted_label = prediction
            else:
                prediction = model.predict([input_data])[0]
                predicted_label = prediction

        return JsonResponse({
            'prediction': str(predicted_label),
            'model_name': ai_model.name,
            'model_type': ai_model.model_type,
        })

    except Exception as e:
        return JsonResponse({'error': f'Prediksi gagal: {str(e)}'}, status=500)

import sys
try:
    sys.path.append(os.path.join(settings.BASE_DIR, 'ml_engine'))
    import problem_framing
except Exception as e:
    problem_framing = None

@csrf_exempt
@api_login_required
def api_ml_framing(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method tidak diizinkan'}, status=405)
        
    if 'file' not in request.FILES:
        return JsonResponse({'error': 'Tidak ada file yang diunggah'}, status=400)
        
    file = request.FILES['file']
    filename = file.name
    ext = os.path.splitext(filename)[1].lower()
    
    # Simpan sementara di media
    os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
    tmp_path = os.path.join(settings.MEDIA_ROOT, 'tmp_framing_' + filename)
    with open(tmp_path, 'wb+') as destination:
        for chunk in file.chunks():
            destination.write(chunk)
            
    try:
        if problem_framing:
            if ext in ['.png', '.jpg', '.jpeg', '.bmp', '.webp']:
                result = problem_framing.analyze_image(tmp_path, filename)
            elif ext in ['.csv', '.xlsx', '.xls', '.json']:
                result = problem_framing.analyze_tabular(tmp_path, filename)
            elif ext in ['.txt', '.md', '.log']:
                result = problem_framing.analyze_text(tmp_path, filename)
            else:
                result = {
                    "title": f"Custom AI Model: {filename}",
                    "category": "klasifikasi",
                    "input": f"File mentah dengan ekstensi {ext}.",
                    "process": "Deep Learning / Machine Learning pipeline.",
                    "output": "Pola prediksi berdasarkan struktur file khusus."
                }
        else:
            result = {"error": "Modul problem_framing.py tidak ditemukan di server."}
            
        if "error" in result:
            return JsonResponse({'error': result['error']}, status=500)
            
        content_json = json.dumps({
            "path": f"/media/tmp_framing_{filename}",
            "input": result.get("input"),
            "process": result.get("process"),
            "output": result.get("output")
        })
        
        DataEntry.objects.create(
            user=request.user,
            title=result.get("title") or f"Smart Framing: {filename}",
            category=result.get("category", "klasifikasi"),
            data_type="problem-framing",
            content=content_json
        )
        
        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({'error': f'Pemrosesan gagal: {str(e)}'}, status=500)


# ============================================================
# INTELLIGENCE SUBMISSION API
# ============================================================

import os
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.utils import timezone


def _detect_data_type_from_file(file_obj):
    """Auto-detect tipe data dari ekstensi file"""
    if not file_obj:
        return 'unknown'
    name = file_obj.name.lower()
    ext = os.path.splitext(name)[1]

    if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.gif', '.tiff']:
        return 'image'
    if ext in ['.csv', '.xlsx', '.xls', '.tsv']:
        return 'tabular'
    if ext in ['.txt', '.md', '.json', '.xml', '.pdf']:
        return 'text'
    if ext in ['.zip', '.tar', '.gz']:
        return 'mixed'
    return 'unknown'


def _validate_api_key(request):
    """Validasi API key dari header X-API-Key"""
    from .models import APIKey

    api_key_value = (
        request.headers.get('X-API-Key')
        or request.headers.get('Authorization', '').replace('Bearer ', '').strip()
    )

    if not api_key_value:
        return None, JsonResponse({
            'success': False,
            'error': 'API key tidak ditemukan. Sertakan header X-API-Key.'
        }, status=401)

    try:
        api_key = APIKey.objects.get(key=api_key_value, is_active=True)
    except APIKey.DoesNotExist:
        return None, JsonResponse({
            'success': False,
            'error': 'API key tidak valid atau nonaktif.'
        }, status=403)

    return api_key, None


@csrf_exempt
def api_submission_receive(request):
    """
    Endpoint untuk Tim Engineer kirim file.
    POST /api/submissions/receive/
    Header: X-API-Key: <key>
    Body (multipart/form-data):
        - source_file (file)        WAJIB
        - title (text)              WAJIB
        - sender_name (text)        opsional
        - description (text)        opsional
        - sender_email (text)       opsional
        - sender_team (text)        opsional
        - extra_metadata (JSON)     opsional
    """
    from .models import IntelligenceSubmission

    if request.method != 'POST':
        return JsonResponse({
            'success': False,
            'error': 'Method tidak didukung. Gunakan POST.'
        }, status=405)

    # 1. Validasi API key
    api_key, error = _validate_api_key(request)
    if error:
        return error

    # 2. Validasi field wajib
    source_file = request.FILES.get('source_file')
    title = request.POST.get('title', '').strip()
    sender_name = request.POST.get('sender_name', '').strip() or api_key.name

    missing = []
    if not source_file:
        missing.append('source_file')
    if not title:
        missing.append('title')
    if missing:
        return JsonResponse({
            'success': False,
            'error': f'Field wajib tidak ada: {", ".join(missing)}'
        }, status=400)

    # 3. Validasi ukuran (max 100 MB)
    MAX_SIZE = 100 * 1024 * 1024
    if source_file.size > MAX_SIZE:
        return JsonResponse({
            'success': False,
            'error': f'File terlalu besar. Maks {MAX_SIZE // (1024*1024)} MB.'
        }, status=413)

    # 4. Parse extra_metadata
    import json
    extra_metadata = {}
    raw_meta = request.POST.get('extra_metadata', '').strip()
    if raw_meta:
        try:
            extra_metadata = json.loads(raw_meta)
        except json.JSONDecodeError:
            extra_metadata = {'raw': raw_meta}

    # 5. Buat submission
    try:
        submission = IntelligenceSubmission.objects.create(
            sender_name=sender_name,
            sender_team=request.POST.get('sender_team', '').strip() or 'Intelligence Engineer',
            sender_email=request.POST.get('sender_email', '').strip() or api_key.email,
            api_key_used=api_key,
            title=title,
            description=request.POST.get('description', '').strip(),
            source_file=source_file,
            file_name=source_file.name,
            file_size=source_file.size,
            detected_data_type=_detect_data_type_from_file(source_file),
            extra_metadata=extra_metadata,
            current_stage=0,
            status='pending',
        )
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Gagal simpan: {str(e)}'
        }, status=500)

    # 6. Update API key stats
    api_key.usage_count += 1
    api_key.last_used_at = timezone.now()
    api_key.save(update_fields=['usage_count', 'last_used_at'])

    # 7. Response sukses
    return JsonResponse({
        'success': True,
        'message': 'File diterima. Akan diproses mulai Tahap 0 (Problem Framing).',
        'submission': {
            'id': submission.id,
            'title': submission.title,
            'sender_name': submission.sender_name,
            'file_name': submission.file_name,
            'file_size': submission.file_size,
            'file_size_mb': round(submission.file_size / (1024 * 1024), 2),
            'detected_data_type': submission.detected_data_type,
            'current_stage': submission.current_stage,
            'current_stage_label': submission.get_current_stage_display(),
            'status': submission.status,
            'received_at': submission.received_at.isoformat(),
            'progress': submission.progress_percentage,
        }
    }, status=201)


def api_submission_status(request, submission_id):
    """Engineer cek status submission. GET /api/submissions/<id>/status/"""
    from .models import IntelligenceSubmission

    if request.method != 'GET':
        return JsonResponse({'error': 'Gunakan GET'}, status=405)

    api_key, error = _validate_api_key(request)
    if error:
        return error

    try:
        submission = IntelligenceSubmission.objects.get(
            id=submission_id,
            api_key_used=api_key
        )
    except IntelligenceSubmission.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Submission tidak ditemukan atau bukan milik Anda.'
        }, status=404)

    return JsonResponse({
        'success': True,
        'submission': {
            'id': submission.id,
            'title': submission.title,
            'status': submission.status,
            'status_label': submission.get_status_display(),
            'current_stage': submission.current_stage,
            'current_stage_label': submission.get_current_stage_display(),
            'progress': submission.progress_percentage,
            'received_at': submission.received_at.isoformat(),
            'completed_at': submission.completed_at.isoformat() if submission.completed_at else None,
            'sent_at': submission.sent_at.isoformat() if submission.sent_at else None,
        }
    })

# ============================================================================
# DATA ENTRY PAGE & API
# ============================================================================
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from .models import IntelligenceSubmission

def data_entry_page(request):
    """Render halaman Data Entry — list semua submission masuk."""
    return render(request, 'data-entry.html')


def data_entry_proses_page(request, submission_id):
    """Render halaman proses 8 tahap pipeline AI untuk submission tertentu."""
    from django.shortcuts import redirect
    if not request.user.is_authenticated:
        return redirect('/creation/login.html')
    try:
        submission = IntelligenceSubmission.objects.get(pk=submission_id)
    except IntelligenceSubmission.DoesNotExist:
        return redirect('/creation/dashboard')
    # Deteksi apakah request dari mobile WebView (parameter ?platform=mobile)
    is_mobile = request.GET.get('platform', '').lower() == 'mobile'
    return render(request, 'structured_data_wizard.html', {
        'submission_id': submission_id,
        'is_mobile': is_mobile,
    })



@require_http_methods(["GET"])
def api_submissions_list(request):
    """GET /api/submissions/list/ - List semua submission untuk Data Entry."""
    try:
        from django.db.models import Q
        from django.utils import timezone
        
        queryset = IntelligenceSubmission.objects.all().order_by('-received_at')
        
        # Auto-detect API key field name
        def get_api_key_field():
            sample = IntelligenceSubmission.objects.first()
            if not sample:
                return None
            for field_name in ['api_key', 'api_key_used', 'source_api_key', 'apikey']:
                if hasattr(sample, field_name):
                    return field_name
            return None
        
        api_key_field = get_api_key_field()
        
        # Filter by status
        status_filter = request.GET.get('status', '').strip().lower()
        if status_filter and status_filter != 'all':
            queryset = queryset.filter(status=status_filter)
        
        # Filter by source
        source_filter = request.GET.get('source', '').strip().lower()
        if source_filter == 'api' and api_key_field:
            queryset = queryset.filter(**{f'{api_key_field}__isnull': False})
        elif source_filter == 'manual' and api_key_field:
            queryset = queryset.filter(**{f'{api_key_field}__isnull': True})
        
        # Search
        search = request.GET.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | 
                Q(sender_name__icontains=search) |
                Q(description__icontains=search)
            )
        
        # Limit
        try:
            limit = min(max(int(request.GET.get('limit', 100)), 1), 500)
        except (ValueError, TypeError):
            limit = 100
        queryset = queryset[:limit]
        
        # Build response
        submissions_data = []
        for sub in queryset:
            # Source detection
            source = 'manual'
            if api_key_field:
                api_value = getattr(sub, api_key_field, None)
                source = 'api' if api_value else 'manual'
            
            # Icon
            icon_map = {
                'image': '🖼️', 'tabular': '📊', 'text': '📄',
                'video': '🎬', 'audio': '🎵', 'mixed': '📦', 'unknown': '📁',
            }
            data_type = getattr(sub, 'detected_data_type', 'unknown') or 'unknown'
            icon = icon_map.get(data_type, '📁')
            
            # File size
            file_size = getattr(sub, 'file_size', 0) or 0
            file_size_mb = round(file_size / (1024 * 1024), 2)
            
            # Time relative
            received_at = getattr(sub, 'received_at', None) or timezone.now()
            now = timezone.now()
            diff = now - received_at
            
            if diff.days > 0:
                time_relative = f"{diff.days} hari lalu"
            elif diff.seconds >= 3600:
                time_relative = f"{diff.seconds // 3600} jam lalu"
            elif diff.seconds >= 60:
                time_relative = f"{diff.seconds // 60} menit lalu"
            else:
                time_relative = "baru saja"
            
            file_path = ''
            file_url = ''
            try:
                if sub.source_file:
                    file_path = sub.source_file.path
                    file_url = sub.source_file.url
            except Exception:
                if sub.source_file:
                    file_path = sub.source_file.name
                    file_url = getattr(sub.source_file, 'url', '')

            submissions_data.append({
                'id': sub.id,
                'title': getattr(sub, 'title', '') or 'Tanpa Judul',
                'sender_name': getattr(sub, 'sender_name', '') or 'Anonymous',
                'sender_email': getattr(sub, 'sender_email', '') or '',
                'description': getattr(sub, 'description', '') or '',
                'source': source,
                'source_label': '[API]' if source == 'api' else '[Manual]',
                'icon': icon,
                'data_type': data_type,
                'file_name': getattr(sub, 'file_name', '') or '-',
                'file_size_mb': file_size_mb,
                'current_stage': getattr(sub, 'current_stage', 0),
                'current_stage_label': f'Stage {getattr(sub, "current_stage", 0)}',
                'status': getattr(sub, 'status', 'pending') or 'pending',
                'progress': getattr(sub, 'progress', 0) or 0,
                'received_at': received_at.isoformat(),
                'time_relative': time_relative,
                'pipeline_data': getattr(sub, 'pipeline_data', {}) or {},
                'extra_metadata': getattr(sub, 'extra_metadata', {}) or {},
                'file_path': file_path,
                'file_url': file_url,
            })
        
        # Stats
        total = IntelligenceSubmission.objects.count()
        api_count = 0
        manual_count = total
        if api_key_field:
            api_count = IntelligenceSubmission.objects.filter(
                **{f'{api_key_field}__isnull': False}
            ).count()
            manual_count = total - api_count
        
        pending_count = IntelligenceSubmission.objects.filter(status='pending').count()
        
        return JsonResponse({
            'success': True,
            'count': len(submissions_data),
            'stats': {
                'total': total,
                'api_count': api_count,
                'manual_count': manual_count,
                'pending_count': pending_count,
            },
            'submissions': submissions_data
        })
    
    except Exception as e:
        import traceback
        return JsonResponse({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }, status=500)


@csrf_exempt
def api_submission_stage_update(request, submission_id):
    """POST /api/submissions/<id>/stage/ - Simpan data tahap Grid 2 dan lanjut ke tahap berikutnya."""
    if request.method not in ['POST', 'PATCH']:
        return JsonResponse({'error': 'Gunakan POST atau PATCH'}, status=405)

    try:
        submission = IntelligenceSubmission.objects.get(id=submission_id)
    except IntelligenceSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission tidak ditemukan'}, status=404)

    import json
    try:
        data = json.loads(request.body)
    except:
        return JsonResponse({'error': 'Body harus berupa JSON valid'}, status=400)

    stage_index = data.get('stage_index')
    stage_data = data.get('stage_data')

    if stage_index is None or stage_data is None:
        return JsonResponse({'error': 'stage_index dan stage_data harus diisi'}, status=400)

    try:
        stage_index = int(stage_index)
    except:
        return JsonResponse({'error': 'stage_index harus berupa angka'}, status=400)

    if stage_index < 0 or stage_index > 7:
        return JsonResponse({'error': 'stage_index harus antara 0-7'}, status=400)

    # Inisialisasi pipeline_data jika kosong
    if not isinstance(submission.pipeline_data, dict):
        submission.pipeline_data = {}

    # Simpan data form ke index yang sesuai — gunakan KEDUA format kunci:
    # - 'stage_N' (format utama, dipakai oleh viewsets.py run_stage)
    # - 'N'       (format lama, untuk backward-compat jika ada kode yg masih pakai ini)
    stage_key = f'stage_{stage_index}'
    submission.pipeline_data[stage_key] = stage_data
    submission.pipeline_data[str(stage_index)] = stage_data  # backward compat

    # Jika tahap yang diisi adalah tahap saat ini atau lebih besar (secara logis),
    # naikkan current_stage ke tahap selanjutnya (jika belum mentok di 7)
    if stage_index >= submission.current_stage and submission.current_stage < 7:
        submission.current_stage = stage_index + 1
        # Ubah status jika baru mulai diproses
        if submission.current_stage == 1 and submission.status == 'pending':
            submission.status = 'in_progress'

    # Jika tahap terakhir (7) diisi, tandai selesai
    if stage_index == 7:
        submission.status = 'completed'
        from django.utils import timezone
        submission.completed_at = timezone.now()

    submission.save()

    return JsonResponse({
        'success': True,
        'message': f'Tahap {stage_index} berhasil disimpan.',
        'current_stage': submission.current_stage,
        'status': submission.status,
        'pipeline_data': submission.pipeline_data
    })

