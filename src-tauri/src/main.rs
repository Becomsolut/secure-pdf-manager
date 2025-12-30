#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use image::ImageOutputFormat;
use lopdf::{Dictionary, Document, Object, StringFormat};
use md5;
use std::io::Cursor;
use std::path::Path;
// WICHTIG: Wir importieren U5 (40-bit) und U10 (80-bit) für die exakten Schlüssellängen
use rand::Rng;
use rc4::{
    consts::{U10, U5},
    KeyInit, Rc4, StreamCipher,
};

// ==========================================
// TEIL 1: KOMPRIMIERUNG (Unverändert)
// ==========================================

fn is_image(obj: &Object) -> bool {
    match obj {
        Object::Stream(stream) => {
            if let Ok(subtype) = stream.dict.get(b"Subtype") {
                if let Ok(name) = subtype.as_name_str() {
                    return name == "Image";
                }
            }
            false
        }
        _ => false,
    }
}

#[tauri::command]
async fn compress_pdf(file_path: String) -> Result<(Vec<u8>, String), String> {
    println!("Komprimiere: {}", file_path);
    let mut doc = Document::load(&file_path).map_err(|e| e.to_string())?;
    
    let mut image_ids = Vec::new();
    for (id, object) in &doc.objects { 
        if is_image(object) { 
            image_ids.push(*id); 
        } 
    }
    
    let mut count = 0;
    for id in image_ids {
        if let Some(Object::Stream(stream)) = doc.objects.get_mut(&id) {
            if let Ok(content) = stream.decompressed_content() {
                if let Ok(img) = image::load_from_memory(&content) {
                    // Hier die Qualität/Größe anpassen (z.B. 1200x1600, JPEG 70%)
                    let resized = img.resize(1200, 1600, image::imageops::FilterType::Triangle);
                    let mut buffer = Vec::new();
                    if let Ok(_) = resized.write_to(&mut Cursor::new(&mut buffer), ImageOutputFormat::Jpeg(70)) {
                        stream.content = buffer;
                        stream.dict.set(b"Filter".to_vec(), Object::Name(b"DCTDecode".to_vec()));
                        stream.dict.remove(b"Length");
                        count += 1;
                    }
                }
            }
        }
    }

    // ÄNDERUNG: Statt auf Disk zu speichern, schreiben wir in einen Buffer (RAM)
    let mut out_buffer = Vec::new();
    doc.save_to(&mut out_buffer).map_err(|e| e.to_string())?;
    
    // Ersparnis berechnen
    let old_size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(1);
    let new_size = out_buffer.len() as u64;
    
    let savings = if old_size > 0 {
        format!("-{}%", 100 - (new_size * 100 / old_size))
    } else {
        "0%".to_string()
    };
    
    println!("Fertig. {} Bilder optimiert. Größe: {} -> {}", count, old_size, new_size);
    
    // Wir geben die Bytes UND den Ersparnis-String zurück
    Ok((out_buffer, savings))
}

// ==========================================
// TEIL 2: VERSCHLÜSSELUNG (MAC KOMPATIBEL / REV 2)
// ==========================================

const PADDING: [u8; 32] = [
    0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
    0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A,
];

fn pad_password(password: &str) -> Vec<u8> {
    let mut p = password.as_bytes().to_vec();
    p.extend_from_slice(&PADDING);
    p.truncate(32);
    p
}

// O-Value Berechnung (5 Byte Key -> RC4<U5>)
fn compute_o_value(user_password: &str, owner_password: &str) -> Vec<u8> {
    let owner_pad = pad_password(owner_password);
    let mut ctx = md5::Context::new();
    ctx.consume(&owner_pad);
    let key_full = ctx.compute();
    let key = &key_full[0..5];

    let user_pad = pad_password(user_password);

    // FIX: Expliziter Typ U5 (5 Bytes)
    let mut rc4: Rc4<U5> = Rc4::new_from_slice(key).expect("Key Error");
    let mut output = user_pad.clone();
    rc4.apply_keystream(&mut output);
    output
}

fn compute_encryption_key(
    user_password: &str,
    o_value: &[u8],
    permissions: i32,
    file_id: &[u8],
) -> Vec<u8> {
    let user_pad = pad_password(user_password);
    let mut ctx = md5::Context::new();
    ctx.consume(&user_pad);
    ctx.consume(o_value);
    ctx.consume(&permissions.to_le_bytes());
    ctx.consume(file_id);
    let hash = ctx.compute();
    hash[0..5].to_vec() // 5 Bytes Key
}

// U-Value Berechnung (5 Byte Key -> RC4<U5>)
fn compute_u_value(encryption_key: &[u8], _file_id: &[u8]) -> Vec<u8> {
    // FIX: Expliziter Typ U5
    let mut rc4: Rc4<U5> = Rc4::new_from_slice(encryption_key).expect("Key Error");
    let mut output = PADDING.to_vec();
    rc4.apply_keystream(&mut output);
    output
}

// Objekt-Verschlüsselung (10 Byte Key -> RC4<U10>)
fn encrypt_content_data(
    encryption_key: &[u8],
    object_id: u32,
    gen_id: u16,
    data: &[u8],
) -> Vec<u8> {
    let mut ctx = md5::Context::new();
    ctx.consume(encryption_key);
    ctx.consume(&object_id.to_le_bytes()[0..3]);
    ctx.consume(&gen_id.to_le_bytes()[0..2]);
    let hash = ctx.compute();

    // Rev 2 Key Länge ist 5 Bytes + 5 Bytes Salt = 10 Bytes
    let obj_key = &hash[0..10];

    // FIX: Expliziter Typ U10 (10 Bytes)
    let mut rc4: Rc4<U10> = Rc4::new_from_slice(obj_key).expect("Key Init Error");
    let mut output = data.to_vec();
    rc4.apply_keystream(&mut output);
    output
}

#[tauri::command]
async fn apply_encryption(file_path: String, password: String) -> Result<String, String> {
    println!("Verschlüssele (Rev 2 - Mac Kompatibel): {}", file_path);

    let mut doc = Document::load(&file_path).map_err(|e| e.to_string())?;

    // ID sicherstellen
    let file_id = if let Ok(id_entry) = doc.trailer.get(b"ID") {
        if let Ok(arr) = id_entry.as_array() {
            if let Some(first) = arr.get(0) {
                // FIX: Sicherer Zugriff auf Bytes, falls es ein String-Objekt ist
                if let Object::String(bytes, _) = first {
                    bytes.clone()
                } else {
                    rand::thread_rng().gen::<[u8; 16]>().to_vec()
                }
            } else {
                rand::thread_rng().gen::<[u8; 16]>().to_vec()
            }
        } else {
            rand::thread_rng().gen::<[u8; 16]>().to_vec()
        }
    } else {
        rand::thread_rng().gen::<[u8; 16]>().to_vec()
    };

    doc.trailer.set(
        b"ID".to_vec(),
        Object::Array(vec![
            Object::String(file_id.clone(), StringFormat::Hexadecimal),
            Object::String(file_id.clone(), StringFormat::Hexadecimal),
        ]),
    );

    let permissions: i32 = -4;

    // 1. Keys berechnen
    let o_value = compute_o_value(&password, &password);
    let key = compute_encryption_key(&password, &o_value, permissions, &file_id);
    let u_value = compute_u_value(&key, &file_id);

    // 2. Content verschlüsseln
    let object_ids: Vec<(u32, u16)> = doc.objects.keys().map(|k| *k).collect();

    for (obj_id, gen_id) in object_ids {
        if let Some(object) = doc.objects.get_mut(&(obj_id, gen_id)) {
            match object {
                Object::String(bytes, _) => {
                    let enc = encrypt_content_data(&key, obj_id, gen_id, bytes);
                    *object = Object::String(enc, StringFormat::Literal);
                }
                Object::Stream(stream) => {
                    let enc = encrypt_content_data(&key, obj_id, gen_id, &stream.content);
                    stream.content = enc;
                }
                _ => {}
            }
        }
    }

    // 3. Dictionary setzen
    let mut dict = Dictionary::new();
    dict.set(b"Filter".to_vec(), Object::Name(b"Standard".to_vec()));
    dict.set(b"V".to_vec(), Object::Integer(1)); // Version 1
    dict.set(b"R".to_vec(), Object::Integer(2)); // Revision 2

    dict.set(b"P".to_vec(), Object::Integer(permissions as i64));
    dict.set(
        b"O".to_vec(),
        Object::String(o_value, StringFormat::Hexadecimal),
    );
    dict.set(
        b"U".to_vec(),
        Object::String(u_value, StringFormat::Hexadecimal),
    );

    doc.trailer
        .set(b"Encrypt".to_vec(), Object::Dictionary(dict));

    let path = Path::new(&file_path);
    let new_filename = format!("{}_secure.pdf", path.file_stem().unwrap().to_str().unwrap());
    let new_path = path.parent().unwrap().join(&new_filename);

    doc.save(&new_path).map_err(|e| e.to_string())?;

    Ok(new_path.to_str().unwrap().to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![compress_pdf, apply_encryption])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
