$envFile = '.\.env.local'
$projectId = (Get-Content $envFile | Where-Object { $_ -match '^VITE_FIREBASE_PROJECT_ID=' }) -replace '^VITE_FIREBASE_PROJECT_ID=', ''
$appId = 'church-vote-production'
Write-Output "Using project=$projectId appId=$appId"

# Get an OAuth access token via gcloud to authenticate REST requests (service account / user)
Write-Output "Obtaining access token via gcloud..."
$accessToken = (& gcloud auth print-access-token) -replace "\s+", ''
if (-not $accessToken) { Write-Error "Could not obtain access token. Ensure gcloud is installed and logged in."; exit 1 }

$pollsUrl = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/artifacts/$appId/public/data/polls"
Write-Output "Querying polls: $pollsUrl"
try {
  $polls = Invoke-RestMethod -Method Get -Uri $pollsUrl -Headers @{ Authorization = "Bearer $accessToken" }
} catch {
  Write-Error "Failed to query polls: $_"
  exit 1
}

if (-not $polls.documents) {
  Write-Output "No polls found in path artifacts/$appId/public/data/polls"
  exit 1
}

$first = $polls.documents[0]
$docName = $first.name
# Extract pollId from name (last segment)
$components = $docName -split '/'
$pollId = $components[-1]
Write-Output "Found pollId=$pollId (title: $($first.fields.question.stringValue))"

# Anonymous sign-up via Identity Toolkit
# Prepare vote document using a token-like userId and write via authenticated REST (service access token)
$uid = ([guid]::NewGuid().ToString()).Replace('-','')
$now = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
$docPath = "projects/$projectId/databases/(default)/documents/artifacts/$appId/public/data/poll_${pollId}_votes/$uid"
$voteBody = @{ fields = @{ userId = @{ stringValue = $uid }; method = @{ stringValue = 'qr' }; votedAt = @{ timestampValue = $now }; selections = @{ mapValue = @{ fields = @{ '0' = @{ integerValue = '1' } } } } } }
$bodyJson = $voteBody | ConvertTo-Json -Depth 10
Write-Output "Submitting vote to $docPath"
try {
  $resp = Invoke-RestMethod -Method Patch -Uri "https://firestore.googleapis.com/v1/$docPath" -Headers @{ Authorization = "Bearer $accessToken" } -Body $bodyJson -ContentType 'application/json'
  Write-Output "Vote submitted: $($resp.name)"
} catch {
  Write-Error "Failed to submit vote: $_"
  if ($_.Exception.Response) { $_.Exception.Response.Content.ReadAsStringAsync() | Write-Output }
  exit 1
}

# Verify vote exists by reading
$verifyUrl = "https://firestore.googleapis.com/v1/$docPath"
$check = Invoke-RestMethod -Method Get -Uri $verifyUrl -Headers @{ Authorization = "Bearer $accessToken" }
Write-Output "Verified vote doc fields:"
$check.fields | ConvertTo-Json -Depth 5
