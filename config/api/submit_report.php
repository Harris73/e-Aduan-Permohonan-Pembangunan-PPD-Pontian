<?php
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';

if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'headmaster') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Akses ditolak.']);
    exit();
}

$school_id   = $_SESSION['user_id'];
$category    = $_POST['category'];
$title       = $_POST['title'];
$description = $_POST['description'];
$priority    = $_POST['priority'];

// Handle Image Upload
$photoFile = $_FILES['evidence_photo'];
$photoPath = 'uploads/photos/' . uniqid('img_') . '.' . pathinfo($photoFile['name'], PATHINFO_EXTENSION);
move_uploaded_file($photoFile['tmp_name'], __DIR__ . '/../' . $photoPath);

// Handle PDF Upload
$pdfFile = $_FILES['pdf_letter'];
$pdfPath = 'uploads/pdfs/' . uniqid('pdf_') . '.pdf';
move_uploaded_file($pdfFile['tmp_name'], __DIR__ . '/../' . $pdfPath);

$db = getDbConnection();
$refNo = 'ADU-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));

$stmt = $db->prepare("
    INSERT INTO reports (reference_no, school_id, category, title, description, priority, evidence_photo_path, pdf_letter_path, status, submitted_at) 
    VALUES (:ref, :sid, :cat, :title, :desc, :prio, :photo, :pdf, 'Menunggu', NOW())
");

$stmt->execute([
    ':ref' => $refNo, ':sid' => $school_id, ':cat' => $category, 
    ':title' => $title, ':desc' => $description, ':prio' => $priority, 
    ':photo' => $photoPath, ':pdf' => $pdfPath
]);

echo json_encode(['success' => true, 'reference_no' => $refNo]);
?>