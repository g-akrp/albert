import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { FlowRunResult } from '../model/types';

export async function reportFlowToAllure(
  flowName: string,
  flowFilePath: string,
  result: FlowRunResult
): Promise<void> {
  const config = vscode.workspace.getConfiguration('albert');
  const enabled = config.get<boolean>('allure.enabled', false);
  const serverUrlRaw = config.get<string>('allure.serverUrl', '');
  const serverUrl = serverUrlRaw.replace(/\/+$/, '');
  const projectId = config.get<string>('allure.projectId', 'default');
  const username = config.get<string>('allure.username', '');
  const password = config.get<string>('allure.password', '');

  if (!enabled || !serverUrl) {
    return;
  }

  try {
    const uuid = crypto.randomUUID();
    const historyId = crypto.createHash('md5').update(flowFilePath).digest('hex');
    const timestamp = Date.now();

    // Calculate mock timing sequences based on step durations
    const totalDuration = result.steps.reduce((acc, s) => acc + s.durationMs, 0);
    const flowStart = timestamp - totalDuration;
    const flowStop = timestamp;

    const filesToUpload: Array<{ file_name: string; content_base64: string }> = [];

    const features = new Set<string>();
    const stories = new Set<string>();
    const suites = new Set<string>();
    const owners = new Set<string>();
    const tags = new Set<string>();
    const descriptions: string[] = [];

    const severityValues: Record<string, number> = {
      blocker: 5,
      critical: 4,
      normal: 3,
      minor: 2,
      trivial: 1,
    };
    let highestSeverity = 'normal';

    let currentStart = flowStart;
    const allureSteps = result.steps.map((step) => {
      const stepStop = currentStart + step.durationMs;
      const stepStart = currentStart;
      currentStart = stepStop;

      const stepAllure = step.allureReportConfig;
      if (stepAllure) {
        if (stepAllure.feature) features.add(stepAllure.feature);
        if (stepAllure.story) stories.add(stepAllure.story);
        if (stepAllure.suite) suites.add(stepAllure.suite);
        if (stepAllure.owner) owners.add(stepAllure.owner);
        if (stepAllure.description) {
          descriptions.push(`${step.name}: ${stepAllure.description}`);
        }
        if (Array.isArray(stepAllure.tags)) {
          stepAllure.tags.forEach((t) => tags.add(t));
        }
        if (stepAllure.severity) {
          const curVal = severityValues[stepAllure.severity] || 0;
          const maxVal = severityValues[highestSeverity] || 0;
          if (curVal > maxVal) {
            highestSeverity = stepAllure.severity;
          }
        }
      }

      const attachmentsList: Array<{ name: string; source: string; type: string }> = [];

      // Request Attachment
      const reqHeadersStr = step.requestHeaders
        ? Object.entries(step.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')
        : '';
      const reqBodyStr = step.requestBody || '';
      const reqContent = `${step.method} ${step.url}\n\n[Headers]\n${reqHeadersStr}\n\n[Body]\n${reqBodyStr}`;

      const reqAttachUuid = crypto.randomUUID();
      const reqAttachFileName = `${reqAttachUuid}-request.txt`;
      filesToUpload.push({
        file_name: reqAttachFileName,
        content_base64: Buffer.from(reqContent, 'utf8').toString('base64'),
      });
      attachmentsList.push({
        name: 'Request',
        source: reqAttachFileName,
        type: 'text/plain',
      });

      // Response Attachment
      const resHeadersStr = step.responseHeaders
        ? Object.entries(step.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')
        : '';
      const resBodyStr = step.bodyPreview || '';
      const resContent = `Status: ${step.status}\n\n[Headers]\n${resHeadersStr}\n\n[Body]\n${resBodyStr}`;

      const resAttachUuid = crypto.randomUUID();
      const resAttachFileName = `${resAttachUuid}-response.txt`;
      filesToUpload.push({
        file_name: resAttachFileName,
        content_base64: Buffer.from(resContent, 'utf8').toString('base64'),
      });
      attachmentsList.push({
        name: 'Response',
        source: resAttachFileName,
        type: 'text/plain',
      });

      const stepFailed = !!step.error || step.checks.some((c) => !c.pass);

      return {
        name: step.name,
        status: stepFailed ? 'failed' : 'passed',
        stage: 'finished',
        start: stepStart,
        stop: stepStop,
        steps: step.checks.map((check) => ({
          name: check.description,
          status: check.pass ? 'passed' : 'failed',
          stage: 'finished',
          start: stepStart,
          stop: stepStop,
        })),
        attachments: attachmentsList,
        parameters: [
          { name: 'Method', value: step.method },
          { name: 'URL', value: step.url },
          ...(step.capturedValues
            ? Object.entries(step.capturedValues).map(([k, v]) => ({
                name: `Captured {{${k}}}`,
                value: v,
              }))
            : []),
        ],
      };
    });

    const labels = [
      { name: 'suite', value: suites.size > 0 ? Array.from(suites).join(', ') : flowName },
      { name: 'framework', value: 'Albert' },
      { name: 'language', value: 'typescript' },
      { name: 'severity', value: highestSeverity },
    ];

    features.forEach((f) => labels.push({ name: 'feature', value: f }));
    stories.forEach((s) => labels.push({ name: 'story', value: s }));
    owners.forEach((o) => labels.push({ name: 'owner', value: o }));
    tags.forEach((t) => labels.push({ name: 'tag', value: t }));

    const allureResult = {
      uuid,
      historyId,
      fullName: flowFilePath,
      name: flowName,
      status: result.ok ? 'passed' : 'failed',
      stage: 'finished',
      steps: allureSteps,
      start: flowStart,
      stop: flowStop,
      description: descriptions.length > 0 ? descriptions.join('\n\n') : undefined,
      labels,
    };

    filesToUpload.push({
      file_name: `${uuid}-result.json`,
      content_base64: Buffer.from(JSON.stringify(allureResult, null, 2), 'utf8').toString('base64'),
    });

    const payload = {
      results: filesToUpload,
    };

    const url = `${serverUrl}/allure-docker-service/send-results?project_id=${projectId}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (username && password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Server returned HTTP ${response.status}: ${errorText}`);
    }

    vscode.window.showInformationMessage('Albert: Test results successfully uploaded to Allure Report Server.');
  } catch (err: any) {
    vscode.window.showWarningMessage(`Albert: Failed to upload results to Allure: ${err?.message ?? err}`);
  }
}
