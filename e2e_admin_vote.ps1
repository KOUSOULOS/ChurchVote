$envFile = '.\.env.local'
$apiKey = (Get-Content $envFile | Where-Object { $_ -match '^VITE_FIREBASE_API_KEY=' }) -replace '^VITE_FIREBASE_API_KEY=', ''
$projectId = (Get-Content $envFile | Where-Object { $_ -match '^VITE_FIREBASE_PROJECT_ID=' }) -replace '^VITE_FIREBASE_PROJECT_ID=', ''
$appId = 'church-vote-production'
Write-Output "Using project=$projectId appId=$appId apiKey=$($apiKey.Substring(0,8))..."

$pollsUrl = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/artifacts/$appId/public/data/polls?key=$apiKey"
Write-Output "Querying polls: $pollsUrl"
$polls = Invoke-RestMethod -Method Get -Uri $pollsUrl
if (-not $polls.documents) { Write-Error "No polls found"; exit 1 }
$first = $polls.documents[0]
$docName = $first.name
$components = $docName -split '/'
$pollId = $components[-1]
Write-Output "Using pollId=$pollId"

# Get an admin access token from gcloud
Write-Output "Fetching gcloud access token..."
$token = (& gcloud auth print-access-token) -join ""
if (-not $token) { Write-Error "Failed to get gcloud token. Ensure gcloud is installed and you're logged in."; exit 1 }

# Compose vote doc
$uid = "admin-test-" + ([int][double]::Parse((Get-Date -UFormat %s)))
$now = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
$docPath = "projects/$projectId/databases/(default)/documents/artifacts/$appId/public/data/poll_${pollId}_votes/$uid"
$voteBody = @{ fields = @{ userId = @{ stringValue = $uid }; method = @{ stringValue = 'admin-seeded' }; votedAt = @{ timestampValue = $now }; selections = @{ mapValue = @{ fields = @{ '0' = @{ integerValue = '1' } } } } } }
$bodyJson = $voteBody | ConvertTo-Json -Depth 10

Write-Output "Writing vote document as admin: $docPath"
$resp = Invoke-RestMethod -Method Patch -Uri "https://firestore.googleapis.com/v1/$docPath" -Headers @{ Authorization = "Bearer $token" } -Body $bodyJson -ContentType 'application/json'
Write-Output "Write response: $($resp.name)"

Write-Output "Verifying vote..."
$check = Invoke-RestMethod -Method Get -Uri "https://firestore.googleapis.com/v1/$docPath" -Headers @{ Authorization = "Bearer $token" }
$check.fields | ConvertTo-Json -Depth 5 | Write-Output
