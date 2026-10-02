const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'supabase-backup.yml'),
  'utf8',
);

describe('Supabase 장기 백업 연결', () => {
  test('폐기 가능한 파일 열쇠 대신 GitHub 전용 무열쇠 연결을 쓴다', () => {
    expect(workflow).toContain('google-github-actions/auth@v3');
    expect(workflow).toContain('GCP_BACKUP_WORKLOAD_IDENTITY_PROVIDER');
    expect(workflow).toContain('GCP_BACKUP_SERVICE_ACCOUNT');
    expect(workflow).not.toContain('credentials_json: ${{ secrets.GCP_BACKUP_SA_KEY }}');
  });

  test('백업 실패를 GitHub 알림으로도 남긴다', () => {
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain('[OPS] Supabase 백업 실패');
    expect(workflow).toContain('REPOSITORY: ${{ github.repository }}');
    expect(workflow).toContain('gh issue list -R "$REPOSITORY"');
    expect(workflow).toContain('Create or update GitHub backup alert');
    expect(workflow).toContain('Close recovered GitHub backup alert');
  });
});
