from django.shortcuts import get_object_or_404, render, redirect
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import IssueCreationStatus, OrchestrationPhase
import requests
import os

INTRING_API_URL = os.environ.get('INTRING_API_URL', 'http://72.61.215.222/intelligence-engineering/api')
INTRING_SECRET = 'INTRING_SECRET_123'

def api_get_projects(request):
    try:
        response = requests.get(f"{INTRING_API_URL}/integration/ic-projects", params={'token': INTRING_SECRET}, timeout=5)
        response.raise_for_status()
        return JsonResponse(response.json(), safe=False)
    except Exception as e:
        return JsonResponse([], safe=False)

def api_get_issues(request, project_id):
    try:
        response = requests.get(f"{INTRING_API_URL}/integration/ic-projects", params={'token': INTRING_SECRET}, timeout=5)
        response.raise_for_status()
        projects = response.json()
        issues = []
        for p in projects:
            if p['id'] == project_id:
                for i in p.get('issues', []):
                    # Find realization locally
                    status_obj = IssueCreationStatus.objects.filter(uiux_issue_id=i['id']).first()
                    realization = status_obj.realization_status if status_obj else 0
                    issues.append({
                        'id': i['id'],
                        'key': i['key'],
                        'title': i['title'],
                        'realization': realization
                    })
                break
        return JsonResponse({'issues': issues})
    except Exception as e:
        return JsonResponse({'issues': []})

def api_intring_status(request):
    try:
        response = requests.get(f"{INTRING_API_URL}/integration/ic-projects", params={'token': INTRING_SECRET}, timeout=5)
        return JsonResponse({"online": response.status_code == 200})
    except:
        return JsonResponse({"online": False})

class DummyObj:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

def issue_full_detail_page(request, issue_id):
    try:
        response = requests.get(f"{INTRING_API_URL}/integration/ic-issues/{issue_id}", params={'token': INTRING_SECRET}, timeout=5)
        response.raise_for_status()
        api_data = response.json()
    except Exception as e:
        return render(request, 'issue_detail.html', {'error': 'Failed to fetch from Intelligence Engineering API.'})
        
    issue_data = api_data['issue']
    c_status_data = api_data['c_status']
    
    # We create a dummy issue object so the template works without changes
    dummy_project = DummyObj(name=issue_data.get('project_name'))
    issue = DummyObj(
        id=issue_data.get('id'),
        issue_key=issue_data.get('issue_key'),
        title=issue_data.get('title'),
        description=issue_data.get('description'),
        project=dummy_project,
        reporter=DummyObj(name=issue_data.get('reporter_name')),
        assignee=DummyObj(name=issue_data.get('assignee_name'))
    )
    
    c_status, _ = IssueCreationStatus.objects.get_or_create(uiux_issue_id=issue_id)
    
    # -- SYNC FROM REMOTE TO LOCAL --
    c_status.realization_status = c_status_data.get('realization_status', c_status.realization_status)
    c_status.development_constraints = c_status_data.get('development_constraints', c_status.development_constraints)
    c_status.save()

    remote_orchs = api_data.get('orchestrations', [])
    for ro in remote_orchs:
        op, created = OrchestrationPhase.objects.get_or_create(
            uiux_issue_id=issue_id,
            category=ro.get('category'),
            defaults={'status': ro.get('status', 'in_progress')}
        )
        if not created:
            op.status = ro.get('status', op.status)
            op.save()
    # -------------------------------
    
    if request.method == 'POST':
        # Process POST via API
        realization = request.POST.get('realization_status')
        if realization:
            try:
                c_status.realization_status = int(realization)
            except ValueError:
                pass
        
        c_status.development_constraints = request.POST.get('development_constraints', '')
        c_status.save()
        
        files = {}
        if 'evidence_file' in request.FILES:
            upload = request.FILES['evidence_file']
            if upload.size > 0:
                upload.seek(0)
                file_content = upload.read()
                upload.seek(0)
                c_status.evidence_file = upload
                c_status.save()
                files = {'evidence_file': (upload.name, file_content, upload.content_type)}

        delete_ev = False
        if request.POST.get('delete_attachment'):
            c_status.evidence_file = None
            c_status.save()
            delete_ev = True
            
        new_category = request.POST.get('new_orch_category')
        if new_category:
            OrchestrationPhase.objects.create(
                uiux_issue_id=issue_id,
                category=new_category,
                status=request.POST.get('new_orch_status', 'in_progress'),
            )
            
        import json
        orch_list = list(OrchestrationPhase.objects.filter(uiux_issue_id=issue_id).values('category', 'status', 'start_date', 'end_date', 'created_at'))
        # Convert datetime to string for json serialization
        for o in orch_list:
            if o.get('created_at'): o['created_at'] = o['created_at'].strftime('%d %b %Y')
            if o.get('start_date'): o['start_date'] = o['start_date'].strftime('%d %b %Y')
            if o.get('end_date'): o['end_date'] = o['end_date'].strftime('%d %b %Y')
            
        post_data = {
            'realization_status': c_status.realization_status,
            'development_constraints': c_status.development_constraints,
            'orchestrations': json.dumps(orch_list)
        }
        if delete_ev:
            post_data['delete_evidence'] = 'true'
        
        try:
            requests.post(f"{INTRING_API_URL}/integration/ic-issues/{issue_id}/update", data=post_data, files=files, params={'token': INTRING_SECRET}, timeout=10)
        except Exception as e:
            pass
            
        return redirect('issue_full_detail', issue_id=issue_id)

    attachments = []
    if c_status.evidence_file:
        attachments.append(DummyObj(id=1, original_name=os.path.basename(c_status.evidence_file.name), file=c_status.evidence_file.url))
    elif c_status_data.get('evidence_file'):
        remote_url = c_status_data['evidence_file']
        if not remote_url.startswith('http'):
            remote_url = f"{INTRING_API_URL.replace('/api', '')}{remote_url}"
        attachments.append(DummyObj(id=1, original_name=os.path.basename(remote_url), file=remote_url))
        
    context = {
        'issue': issue,
        'c_status': c_status,
        'orchestrations': OrchestrationPhase.objects.filter(uiux_issue_id=issue_id),
        'attachments': attachments,
        'mo': api_data.get('mo', {}),
        'ie': api_data.get('ie', {}),
        'ii': api_data.get('ii', {}),
    }
    return render(request, 'issue_detail.html', context)
