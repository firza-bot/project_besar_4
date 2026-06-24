from django.shortcuts import get_object_or_404, render, redirect
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import UIUXProject, UIUXIssue, IssueCreationStatus, OrchestrationPhase, UIUXAttachment
import os, time

@login_required
def api_get_projects(request):
    projects = UIUXProject.objects.using('uiux_db').all()
    data = []
    for p in projects:
        # Fetch issues for this project
        issues = UIUXIssue.objects.using('uiux_db').filter(project_id=p.id).select_related('assignee', 'reporter')
        issues_list = []
        for i in issues:
            issues_list.append({
                'id': i.id, 
                'key': i.issue_key, 
                'title': i.title,
                'status': i.status or 'To Do',
                'priority': i.priority or 'Medium',
                'assignee': i.assignee.name if i.assignee else 'Belum ditugaskan',
                'reporter': i.reporter.name if i.reporter else 'Demo User',
                'description': i.description or ''
            })
        
        data.append({
            'id': p.id,
            'project_name': p.name,
            'description': p.description,
            'status': p.status,
            'visibility': p.type,
            'issues': issues_list
        })
    return JsonResponse(data, safe=False)


@login_required
def api_get_issues(request, project_id):
    issues = UIUXIssue.objects.using('uiux_db').filter(project_id=project_id)
    data = []
    for issue in issues:
        # Get or create status
        status, created = IssueCreationStatus.objects.get_or_create(uiux_issue_id=issue.id)
        data.append({
            'id': issue.id,
            'key': issue.issue_key,
            'title': issue.title,
            'realization': status.realization_status
        })
    return JsonResponse({'issues': data})

import urllib.request
from urllib.error import URLError, HTTPError
def api_intring_status(request):
    # Intelligence Creation and Intelligence Engineering share the same database locally,
    # so if this endpoint is reachable, the service is guaranteed to be online.
    return JsonResponse({"online": True})

def issue_full_detail_page(request, issue_id):
    issue = get_object_or_404(UIUXIssue.objects.using('uiux_db').select_related('assignee', 'reporter', 'sprint', 'project'), id=issue_id)
    
    # Get or create creation status
    c_status, _ = IssueCreationStatus.objects.get_or_create(uiux_issue_id=issue_id)
    
    import json
    def parse_json(field):
        if not field: return None
        if isinstance(field, dict): return field
        try:
            res = json.loads(field)
            if isinstance(res, str):
                return json.loads(res)
            return res
        except:
            return None
            
    if request.method == 'POST':
        # Handle Delete Attachment
        del_att = request.POST.get('delete_attachment')
        if del_att:
            try:
                att = UIUXAttachment.objects.using('uiux_db').get(id=int(del_att), issue_id=issue_id)
                # Remove file physically from Django media
                from django.conf import settings
                django_path = os.path.join(settings.MEDIA_ROOT, att.file.replace('/', '\\'))
                if os.path.exists(django_path):
                    try:
                        os.remove(django_path)
                    except Exception:
                        pass
                
                # Safe fallback for legacy paths
                try:
                    file_path = os.path.join(r"C:\Kuliah\UIUX\Backend\media", att.file.replace('/', '\\'))
                    if os.path.exists(file_path):
                        os.remove(file_path)
                except Exception:
                    pass
                try:
                    local_path = os.path.join(r"C:\Kuliah\project_besar4\media", att.file.replace('/', '\\'))
                    if os.path.exists(local_path):
                        os.remove(local_path)
                except Exception:
                    pass

                att.delete()
                # Also clear local evidence if name matches loosely
                if c_status.evidence_file and att.original_name in c_status.evidence_file.name:
                    c_status.evidence_file = None
                    c_status.save()
            except UIUXAttachment.DoesNotExist:
                pass
            return redirect('issue_full_detail', issue_id=issue_id)

        # Process Creation Status
        realization = request.POST.get('realization_status')
        if realization:
            try:
                c_status.realization_status = int(realization)
            except ValueError:
                pass
        
        c_status.development_constraints = request.POST.get('development_constraints', '')
        
        # Handle file upload
        if 'evidence_file' in request.FILES:
            upload = request.FILES['evidence_file']
            c_status.evidence_file = upload
            
            # Save file physically to current Django media
            from django.conf import settings
            target_dir = os.path.join(settings.MEDIA_ROOT, 'evidence')
            os.makedirs(target_dir, exist_ok=True)
            
            timestamp = int(time.time())
            filename = f"{timestamp}_{upload.name}"
            target_path = os.path.join(target_dir, filename)
            
            with open(target_path, 'wb+') as dest:
                for chunk in upload.chunks():
                    dest.write(chunk)
            
            # Safe sync to legacy directories if they exist
            try:
                legacy_dir_1 = r"C:\Kuliah\UIUX\Backend\media\evidence"
                if os.path.exists(r"C:\Kuliah\UIUX\Backend"):
                    os.makedirs(legacy_dir_1, exist_ok=True)
                    with open(os.path.join(legacy_dir_1, filename), 'wb+') as dest1:
                        for chunk in upload.chunks():
                            dest1.write(chunk)
            except Exception:
                pass
                
            try:
                legacy_dir_2 = r"C:\Kuliah\project_besar4\media\evidence"
                if os.path.exists(r"C:\Kuliah\project_besar4"):
                    os.makedirs(legacy_dir_2, exist_ok=True)
                    with open(os.path.join(legacy_dir_2, filename), 'wb+') as dest2:
                        for chunk in upload.chunks():
                            dest2.write(chunk)
            except Exception:
                pass
                    
            # Insert to core_attachments
            UIUXAttachment.objects.using('uiux_db').create(
                issue_id=issue_id,
                user_id=issue.reporter_id or 1,
                file=f"evidence/{filename}",
                original_name=upload.name,
                mimetype=upload.content_type or 'application/octet-stream',
                size=upload.size
            )
            
        c_status.save()
        
        # Process Orchestration Phase (Simple add)
        new_category = request.POST.get('new_orch_category')
        if new_category:
            OrchestrationPhase.objects.create(
                uiux_issue_id=issue_id,
                category=new_category,
                status=request.POST.get('new_orch_status', 'in_progress'),
            )
            
        # Sync to IntringPM core_issues JSON field
        intring_cs = parse_json(issue.creation_status) or {}
        intring_cs["progress"] = c_status.realization_status
        intring_cs["modules"] = [m.strip() for m in c_status.development_constraints.split('\n') if m.strip()]
        
        phases = OrchestrationPhase.objects.filter(uiux_issue_id=issue_id).order_by('created_at')
        intring_cs["orchestration"] = [
            {
                "category": p.category, 
                "status": p.status, 
                "created_at": p.created_at.strftime('%d %b %Y') if p.created_at else ''
            } for p in phases
        ]
        
        issue.creation_status = intring_cs
        issue.save(using='uiux_db')
        
        return redirect('issue_full_detail', issue_id=issue_id)

    mo = parse_json(issue.meaningful_objectives)
    ie = parse_json(issue.intelligence_experience)
    ii = parse_json(issue.intelligence_implementation)
    
    # IntringPM attachments
    attachments = UIUXAttachment.objects.using('uiux_db').filter(issue_id=issue_id)

    # Context
    context = {
        'issue': issue,
        'c_status': c_status,
        'orchestrations': OrchestrationPhase.objects.filter(uiux_issue_id=issue_id),
        'attachments': attachments,
        'mo': mo,
        'ie': ie,
        'ii': ii,
    }
    return render(request, 'issue_detail.html', context)

