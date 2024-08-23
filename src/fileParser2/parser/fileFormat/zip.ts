import { FileFormat } from './type';

export const ZIP: FileFormat = {
    name: 'zip',
    format: `
#header
Local_file_header_signature, 4, string
Version_needed_to_extract, 2, number
General_purpose_bit_flag, 2, number
Compression_method, 2, number
Last_mod_file_time, 2, number
Last_mod_file_date, 2, number
CRC32, 4
Compressed_size, 4, number
Uncompressed_size, 4, number
Filename_length, 2, number
Extra_field_length, 2, number

while([50 4B 05 06]): ##center
central_directory_signature, 4,string
version_made_by, 2,number
version_needed_to_extract, 2,number
general_purpose_bit_flag, 2
compression_method, 2,number
last_mod_file_time, 2,number
last_mod_file_date, 2,number
crc32, 4
compressed_size, 4,number
uncompressed_size, 4,number
filename_length, 2,number
extra_field_length, 2,number
file_comment_length, 2,number
disk_number_start, 2,number
internal_file_attributes, 2,number
external_file_attributes, 4,number
relative_offset_of_local_header, 4,number
`,
};
