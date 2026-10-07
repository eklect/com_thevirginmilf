import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { SERVICE_SCOPES, ServiceScope } from '../scopes';

export class CreateApiClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SERVICE_SCOPES.length)
  @IsIn(SERVICE_SCOPES, { each: true })
  scopes: ServiceScope[];
}
